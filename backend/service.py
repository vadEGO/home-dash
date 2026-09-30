#!/usr/bin/env python3
"""Home Dash: standard-library HTTPS service; all upstream access is read-only."""
import argparse
import datetime as dt
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import sqlite3
import ssl
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UTC = dt.timezone.utc
STATES = {s: i for i, s in enumerate(('ready', 'wait_for_entry', 'chasing_risk', 'holding', 'exit_trim', 'exiting', 'research', 'invalidated', 'unknown'))}

def stamp():
    return dt.datetime.now(UTC).isoformat()

def epoch(value):
    try:
        return dt.datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()
    except (ValueError, TypeError):
        return None

def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) else None

def fetch(url, headers=None):
    request = urllib.request.Request(url, headers=headers or {})
    context = ssl.create_default_context()
    # Python.org macOS installs may have no CA bundle configured. Use Apple's
    # maintained bundle in addition to interpreter trust; never disable validation.
    if sys.platform == 'darwin' and Path('/etc/ssl/cert.pem').is_file():
        context.load_verify_locations('/etc/ssl/cert.pem')
    with urllib.request.urlopen(request, timeout=25, context=context) as response:
        raw = response.read(8_000_001)
        if len(raw) > 8_000_000:
            raise ValueError('Upstream response too large')
        return json.loads(raw)

def weather():
    query = urllib.parse.urlencode(dict(latitude=-33.8688, longitude=151.2093,
        current='temperature_2m,weather_code,is_day', daily='temperature_2m_max,temperature_2m_min,sunrise,sunset',
        timezone='Australia/Sydney', timeformat='unixtime', forecast_days=1))
    data = fetch('https://api.open-meteo.com/v1/forecast?' + query)
    current, daily = data['current'], data['daily']
    if number(current['temperature_2m']) is None:
        raise ValueError('Missing weather temperature')
    return dict(temperature=current['temperature_2m'], code=current['weather_code'],
        high=daily['temperature_2m_max'][0], low=daily['temperature_2m_min'][0],
        as_of=dt.datetime.fromtimestamp(current['time'], UTC).isoformat(),
        sunrise=daily['sunrise'][0], sunset=daily['sunset'][0], source='Open-Meteo',
        source_url='https://open-meteo.com/')

def primary_key(row):
    return (STATES.get(row.get('action_state'), 99), -(number(row.get('total_score')) or 0),
            -(number(row.get('confirmed_by_count')) or 0), str(row.get('id', '')))

def current_idea(row, now):
    quoted = epoch(row.get('price_as_of'))
    return (row.get('actionability_status') in ('actionable', 'review_required')
        and all(row.get(k + '_freshness_status') == 'fresh' for k in ('evidence', 'price', 'levels', 'review'))
        and number(row.get('current_price')) is not None and row['current_price'] > 0
        and quoted is not None and 0 <= now - quoted <= 7 * 86400)

def normalize(row, siblings):
    price = number(row.get('current_price'))
    score = number(row.get('total_score'))
    return dict(id=str(row.get('id', '')), symbol=str(row.get('normalized_symbol') or row.get('symbol') or '?').upper(),
        price=price if price is not None and price > 0 else None,
        score=score if score is not None and 0 <= score <= 100 else None,
        bias=str(row.get('direction') or '—').upper(), title=row.get('title'), thesis=row.get('thesis'),
        why_now=row.get('why_now'), state=row.get('action_state'), price_as_of=row.get('price_as_of'),
        price_status=row.get('price_freshness_status'), price_source=row.get('price_source'),
        evidence_as_of=row.get('evidence_last_confirmed_at'), evidence_status=row.get('evidence_freshness_status'),
        reviewed_at=row.get('review_last_checked_at'), source_updated_at=row.get('updated_at'),
        source_url=row.get('source_url'), source=row.get('source'),
        conflict=len({str(r.get('direction')).lower() for r in siblings} & {'long', 'short'}) == 2,
        values=[], change=None, chart_as_of=None, chart_status='unavailable',
        **{key: number(row.get(key)) for key in ('ideal_entry', 'entry_min', 'entry_max',
            'do_not_chase_above', 'stop_loss', 'take_profit_1', 'take_profit_2', 'take_profit_3',
            'thesis_score', 'entry_score', 'risk_reward_score', 'catalyst_score', 'source_score',
            'liquidity_score', 'portfolio_fit_score')},
        **{key: row.get(key) for key in ('what_to_watch', 'invalidation', 'next_action',
            'trailing_exit_trigger', 'expires_at', 'levels_last_revalidated_at',
            'levels_freshness_status', 'levels_review_reason', 'actionability_status',
            'actionability_reason', 'evidence_review_reason')},
        source_details=[{key: detail.get(key) for key in ('source', 'source_url', 'author', 'notes', 'confirmed_at')}
            for detail in (row.get('source_details') or []) if isinstance(detail, dict)],
        other_views=[{key: other.get(key) for key in ('id', 'title', 'direction', 'thesis', 'invalidation', 'source', 'source_url')}
            for other in sorted(siblings, key=primary_key) if other.get('id') != row.get('id')][:8])

def chart(candles, now):
    # Eight daily closes span seven days. Do not label a partial/stale series "7D".
    points = {}
    for c in candles:
        ts, close = epoch(c.get('ts')), number(c.get('close'))
        if ts is not None and ts <= now and close is not None and close > 0:
            if ts in points and points[ts] != close:
                return dict(values=[], change=None, chart_as_of=None, chart_status='conflicting sources')
            points[ts] = close
    series = sorted(points.items())[-8:]
    valid = len(series) == 8 and now - series[-1][0] < 2 * 86400 and all(23*3600 <= b[0]-a[0] <= 25*3600 for a,b in zip(series,series[1:]))
    if not valid:
        return dict(values=[], change=None, chart_as_of=None, chart_status='missing, gapped or old history')
    return dict(values=[p[1] for p in series], change=(series[-1][1]/series[0][1]-1)*100,
        chart_as_of=dt.datetime.fromtimestamp(series[-1][0], UTC).isoformat(), chart_status='daily closes')

class MoneyTrail:
    def __init__(self, config):
        self.url = config.get('supabase_url', '').rstrip('/')
        self.key = config.get('supabase_publishable_key', '')
        self.symbols = config['watchlist']
        if self.url and (urllib.parse.urlsplit(self.url).scheme != 'https' or urllib.parse.urlsplit(self.url).query):
            raise ValueError('Supabase URL must be HTTPS')
    def query(self, table, params):
        return fetch(self.url + '/rest/v1/' + table + '?' + urllib.parse.urlencode(params), {'apikey': self.key})
    def load(self):
        if not self.url or not self.key:
            raise ValueError('MoneyTrail not configured')
        rows = []
        for offset in range(0, 50000, 500):
            batch = self.query('public_opportunity_action_board', dict(select='*', order='state_rank.asc,ticker_rank.asc,id.asc', limit=500, offset=offset))
            if not isinstance(batch, list):
                raise ValueError('Invalid MoneyTrail response')
            rows.extend(batch)
            if len(batch) < 500:
                break
        else:
            raise ValueError('MoneyTrail pagination limit reached')
        groups = {}
        for row in rows:
            if row.get('deleted_at'):
                continue
            sym = str(row.get('normalized_symbol') or row.get('symbol') or '').upper()
            groups.setdefault(sym, []).append(row)
        now = time.time()
        assets = []
        for item in self.symbols:
            # Legacy string configs remain supported. Display names are independent
            # from exact source identities; unresolved identities never fetch quotes.
            entry = {'symbol': item, 'moneytrail_symbol': item} if isinstance(item, str) else item
            sym = entry.get('moneytrail_symbol')
            siblings = groups.get(sym, []) if sym else []
            chosen = sorted(siblings, key=primary_key)
            asset = normalize(chosen[0] if chosen else {'symbol': entry['symbol']}, siblings)
            asset['source_symbol'] = sym
            asset['symbol'] = entry['symbol']
            asset['name'] = entry.get('name', entry['symbol'])
            asset['mapping_status'] = 'configured' if sym else 'awaiting instrument mapping'
            if not sym:
                asset['thesis'] = 'Instrument mapping needs confirmation on the Hermes Mac. No quote or score has been substituted.'
                assets.append(asset)
                continue
            try:
                candles = self.query('market_candles', dict(select='ts,close', symbol='eq.'+sym, interval='eq.1d', order='ts.desc', limit=30))
                asset.update(chart(candles, now))
            except Exception:
                asset['chart_status'] = 'history unavailable'
            assets.append(asset)
        ideas = []
        for siblings in groups.values():
            eligible = sorted((r for r in siblings if current_idea(r, now)), key=primary_key)
            if eligible:
                ideas.append(normalize(eligible[0], siblings))
        ideas.sort(key=lambda a: (-(a['score'] if a['score'] is not None else -1), a['symbol']))
        return dict(assets=assets, ideas=ideas[:20])

class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.root/'cache.sqlite', check_same_thread=False)
        self.db.execute('CREATE TABLE IF NOT EXISTS cache (name TEXT PRIMARY KEY, payload TEXT, checked TEXT, success TEXT, error TEXT)')
        self.db.execute('CREATE TABLE IF NOT EXISTS changes (symbol TEXT PRIMARY KEY, signature TEXT, changed TEXT)')
        self.db.commit()
    def refresh(self, name, loader):
        try:
            data = loader()
            if name == 'market':
                # Detect substantive primary-idea changes, not repeated export timestamps.
                with self.lock:
                    baseline = self.db.execute("SELECT 1 FROM cache WHERE name='market' AND payload IS NOT NULL").fetchone() is not None
                    for a in data['ideas']:
                        sig = json.dumps([a.get(k) for k in ('id','score','bias','state','thesis','why_now','evidence_as_of','ideal_entry','entry_min','entry_max','stop_loss','take_profit_1','take_profit_2','take_profit_3','do_not_chase_above','invalidation','what_to_watch','trailing_exit_trigger')], sort_keys=True)
                        old = self.db.execute('SELECT signature,changed FROM changes WHERE symbol=?', (a['symbol'],)).fetchone()
                        # Added detail fields establish a baseline on upgrade; don't
                        # report a schema extension as changed research.
                        different = old and json.loads(old[0]) != json.loads(sig)[:len(json.loads(old[0]))]
                        changed = stamp() if different or (not old and baseline) else old[1] if old else None
                        self.db.execute('INSERT OR REPLACE INTO changes VALUES (?,?,?)', (a['symbol'], sig, changed))
                        a['changed_at'] = changed
            with self.lock:
                self.db.execute('INSERT OR REPLACE INTO cache VALUES (?,?,?,?,NULL)', (name,json.dumps(data,allow_nan=False),stamp(),stamp()))
                self.db.commit()
        except Exception as exc:
            # Exception strings may include credential-bearing upstream URLs; expose type only.
            with self.lock:
                self.db.execute('INSERT INTO cache(name,checked,error) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET checked=excluded.checked,error=excluded.error', (name,stamp(),type(exc).__name__))
                self.db.commit()
    def snapshot(self):
        with self.lock:
            providers = {r[0]:dict(data=json.loads(r[1]) if r[1] else None, checked_at=r[2], fetched_at=r[3], error=r[4]) for r in self.db.execute('SELECT * FROM cache')}
        try:
            briefings = json.loads((self.root/'briefings.json').read_text())
        except (OSError, ValueError):
            briefings = []
        return dict(version=1, generated_at=stamp(), providers=providers, briefings=briefings)

def serve(root):
    root = Path(root)
    config = json.loads((root/'config.json').read_text())
    token = (root/'device-token').read_text().strip()
    if len(token) < 32:
        raise ValueError('Device token too short')
    from tasks import Tasks
    tasks = Tasks(root)
    store, market = Store(root), MoneyTrail(config)
    def poll():
        while True:
            store.refresh('weather', weather)
            store.refresh('market', market.load)
            time.sleep(max(60, config.get('refresh_seconds', 900)))
    threading.Thread(target=poll, daemon=True).start()
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/health':
                code, payload = 200, {'status':'running', 'version':1}
            elif self.path != '/v1/dashboard':
                code, payload = 404, {'error':'not found'}
            elif not hmac.compare_digest(self.headers.get('Authorization','').encode(), ('Bearer '+token).encode()):
                code, payload = 401, {'error':'unauthorized'}
            else:
                code, payload = 200, dict(store.snapshot(), tasks=tasks.snapshot())
            self.respond(code, payload)
        def do_POST(self):
            if self.path != '/v1/actions':
                self.respond(404, {'error':'not found'}); return
            if not hmac.compare_digest(self.headers.get('Authorization','').encode(), ('Bearer '+token).encode()):
                self.respond(401, {'error':'unauthorized'}); return
            try:
                size = int(self.headers.get('Content-Length','0'))
                if not 0 < size <= 16384:
                    raise ValueError('Invalid request size')
                operation = json.loads(self.rfile.read(size))
                if operation.get('action') not in ('reminder_done','reminder_snooze','shopping_set'):
                    raise ValueError('Phone action unsupported')
                result = tasks.apply(operation)
                self.respond(200, dict(version=1, result=result, tasks=tasks.snapshot()))
            except (ValueError, TypeError, AttributeError):
                self.respond(400, {'error':'invalid action'})
        def respond(self, code, payload):
            body = json.dumps(payload,allow_nan=False).encode()
            self.send_response(code)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store')
            self.end_headers()
            self.wfile.write(body)
        def log_message(self, *args):
            pass
    class Server(ThreadingHTTPServer):
        daemon_threads = True
        def get_request(self):
            sock, addr = self.socket.accept()
            sock.settimeout(10)
            try:
                return context.wrap_socket(sock, server_side=True), addr
            except Exception:
                sock.close()
                raise
    server = Server((config.get('bind','0.0.0.0'), config.get('port',8765)), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(root/'server.crt', root/'server.key')
    server.serve_forever()

if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--state', required=True)
    args = parser.parse_args()
    serve(args.state)
