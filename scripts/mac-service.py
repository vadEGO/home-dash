#!/usr/bin/env python3
"""Install immutable Git revisions as a per-user launchd service. No root needed."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import secrets
import ssl
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path.home()/'Library/Application Support/HomeDash'
LABEL = 'local.home-dash.service'
PLIST = Path.home()/'Library/LaunchAgents'/f'{LABEL}.plist'
REPO = Path(__file__).resolve().parents[1]

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def install(revision):
    # Only committed code enters releases. Caller supplies a reviewed commit or tag.
    commit = subprocess.check_output(['git','rev-parse','--verify',revision+'^{commit}'], cwd=REPO, text=True).strip()
    release = (ROOT/'releases'/commit).resolve()
    release.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryFile() as archive:
        run('git','archive',commit,'backend', cwd=REPO, stdout=archive)
        archive.seek(0)
        with tarfile.open(fileobj=archive) as tar:
            for member in tar.getmembers():
                if member.issym() or member.islnk() or not (release/member.name).resolve().is_relative_to(release):
                    raise ValueError('Unsafe release archive')
            tar.extractall(release, filter='data')
    (ROOT/'logs').mkdir(exist_ok=True)
    runtime = ROOT/'runtime'
    if not (runtime/'bin/python3').exists():
        run(sys.executable, '-m', 'venv', str(runtime))
    config_path = ROOT/'config.json'
    if not config_path.exists():
        config_path.write_text(json.dumps(dict(bind='0.0.0.0',port=8765,refresh_seconds=900,
            watchlist=json.loads((release/'backend/watchlist.json').read_text()),supabase_url='',supabase_publishable_key=''),indent=2)+'\n')
    if not (ROOT/'device-token').exists():
        (ROOT/'device-token').write_text(secrets.token_urlsafe(32)+'\n')
    if not (ROOT/'server.crt').exists():
        run('openssl','req','-x509','-newkey','rsa:3072','-nodes','-days','825',
            '-keyout',str(ROOT/'server.key'),'-out',str(ROOT/'server.crt'),'-subj','/CN=HomeDash',
            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    previous = json.loads((ROOT/'release.json').read_text()) if (ROOT/'release.json').exists() else {}
    if previous.get('current') != commit:
        (ROOT/'release.json').write_text(json.dumps(dict(current=commit,previous=previous.get('current'))))
    PLIST.parent.mkdir(exist_ok=True)
    spec = dict(Label=LABEL,ProgramArguments=[str(runtime/'bin/python3'),str(release/'backend/service.py'),'--state',str(ROOT)],
        RunAtLoad=True,KeepAlive=True,WorkingDirectory=str(ROOT),ThrottleInterval=15,
        StandardOutPath=str(ROOT/'logs/stdout.log'),StandardErrorPath=str(ROOT/'logs/stderr.log'),Umask=63)
    PLIST.write_bytes(plistlib.dumps(spec))
    restart()
    print('Installed revision '+commit+'. Configure MoneyTrail, then pair the phone. See docs/hermes-deploy.md.')

def restart():
    domain = 'gui/'+str(os.getuid())
    subprocess.run(['launchctl','bootout',domain+'/'+LABEL],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    run('launchctl','bootstrap',domain,str(PLIST))

def apply_watchlist(path):
    value = json.loads(Path(path).read_text())
    if not isinstance(value, list) or not value or len(value) > 100:
        raise ValueError('Watchlist must contain 1–100 entries')
    symbols = []
    for entry in value:
        if not isinstance(entry, dict) or not isinstance(entry.get('symbol'), str) or not entry['symbol'].strip():
            raise ValueError('Each entry requires a display symbol')
        mapped = entry.get('moneytrail_symbol')
        if mapped is not None and (not isinstance(mapped, str) or not mapped.strip()):
            raise ValueError('moneytrail_symbol must be an exact source symbol or null')
        symbols.append(entry['symbol'])
    if len(set(symbols)) != len(symbols):
        raise ValueError('Duplicate display symbols')
    config_path = ROOT/'config.json'
    config = json.loads(config_path.read_text())
    config['watchlist'] = value
    temp = ROOT/'config.json.tmp'
    temp.write_text(json.dumps(config, indent=2)+'\n')
    temp.replace(config_path)
    print('Saved '+str(len(value))+' watchlist entries. Restart the service to apply.')

def publish(path):
    value = json.loads(Path(path).read_text())
    if not isinstance(value,list) or len(value)>30:
        raise ValueError('Provide an array of at most 30 briefings')
    result=[]
    for b in value:
        if not isinstance(b,dict) or not all(isinstance(b.get(k),str) and 0<len(b[k])<=2000 for k in ('id','title','published_at')):
            raise ValueError('Each briefing needs id, title and published_at strings')
        from datetime import datetime
        published = datetime.fromisoformat(b['published_at'].replace('Z','+00:00'))
        if published.tzinfo is None:
            raise ValueError('published_at requires a timezone')
        if not isinstance(b.get('body'),list) or not 1<=len(b['body'])<=10 or not all(isinstance(p,str) and len(p)<=4000 for p in b['body']):
            raise ValueError('body must contain 1–10 short paragraphs')
        result.append({k:b[k] for k in ('id','title','published_at','body')})
    if len({b['id'] for b in result}) != len(result):
        raise ValueError('Briefing ids must be unique')
    temp=ROOT/'briefings.json.tmp'
    temp.write_text(json.dumps(result,allow_nan=False))
    temp.replace(ROOT/'briefings.json')
    print('Published '+str(len(result))+' briefings; phone picks these up on its next poll.')

if __name__ == '__main__':
    if sys.version_info < (3, 11, 8):
        raise SystemExit('Use Python 3.11.8 or newer (the Hermes Python 3.11.14 interpreter is suitable).')
    os.umask(0o077)
    parser=argparse.ArgumentParser()
    parser.add_argument('command',choices=['install','restart','status','pairing','publish','rollback','watchlist'])
    parser.add_argument('value',nargs='?')
    args=parser.parse_args()
    if args.command=='install':
        if not args.value: parser.error('install requires an explicit commit or tag')
        install(args.value)
    elif args.command=='watchlist':
        apply_watchlist(args.value or REPO/'backend/watchlist.json')
    elif args.command=='restart': restart()
    elif args.command=='status': run('launchctl','print','gui/'+str(os.getuid())+'/'+LABEL)
    elif args.command=='rollback':
        previous=json.loads((ROOT/'release.json').read_text()).get('previous')
        if not previous: raise SystemExit('No previous release recorded')
        install(previous)
    elif args.command=='publish':
        if not args.value: parser.error('publish requires a JSON file')
        publish(args.value)
    elif args.command=='pairing':
        der=ssl.PEM_cert_to_DER_cert((ROOT/'server.crt').read_text())
        print('Certificate SHA-256: '+hashlib.sha256(der).hexdigest())
        print('Device token: '+(ROOT/'device-token').read_text().strip())
        print('URL: https://<dedicated-Mac-LAN-IP-or-hostname>:8765')
