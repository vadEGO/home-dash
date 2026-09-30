# Hermes deployment handoff — preview 0.2

Deploy on the **dedicated Hermes Mac**, after user login. The development Mac does not host production. This adds a separate Python service; it does not modify Hermes, MoneyTrail, their databases, or their launch agents. No Docker, app store, or Python packages are required. A private venv is created from the Python interpreter you use.

## 1. Check out and inspect

Clone `https://github.com/vadEGO/home-dash.git` into your normal projects directory, or fetch an existing checkout. Choose an explicit reviewed commit from Git; do not deploy an unreviewed moving branch automatically. Requires Python **3.11.8+** (the reported Hermes 3.11.14 interpreter is suitable), Git, macOS launchd and OpenSSL.

From the repository:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 scripts/mac-service.py install <reviewed-commit-sha>
```

Use the full path to your Python 3.11 interpreter in place of `python3` if the system Python is older. The installer creates:

- `~/Library/Application Support/HomeDash/releases/<commit>/backend/`: committed service code.
- `~/Library/Application Support/HomeDash/runtime/`: isolated standard-library Python venv.
- `config.json`, `device-token`, TLS certificate/key, SQLite cache and briefings in the same HomeDash state directory.
- `~/Library/LaunchAgents/local.home-dash.service.plist`: starts after login, restarts on failure.
- `logs/stdout.log` and `logs/stderr.log`: local service diagnostics. HTTP requests and authorization headers are not logged.

State files are created with owner-only permissions. No credentials or database files belong in the checkout. The service listens on LAN port **8765** using HTTPS. Keep it on the trusted home network; do not forward this port to the internet. Allow incoming access for this service in the Mac firewall if macOS prompts. The phone and Mac need network connectivity; use a DHCP reservation or stable `.local` hostname. Mac sleep still interrupts service; confirm the dedicated Mac's existing sleep policy is suitable.

## 2. Configure MoneyTrail locally

Edit `~/Library/Application Support/HomeDash/config.json` directly on the dedicated Mac. Copy **only** these existing MoneyTrail values from its local environment configuration:

| Dashboard field | Existing MoneyTrail field |
|---|---|
| `supabase_url` | `NEXT_PUBLIC_SUPABASE_URL` |
| `supabase_publishable_key` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

Use the existing **publishable/anon read access**, never a service-role or database administrator key. Do not print, commit, upload, or send the contents of either environment file. Do not change RLS policies or broaden access to make this work. If chart history is not readable with current permissions, charts remain unavailable.

The initial configurable watchlist is `SOL, SUI, BTC, ETH, TAO, PENDLE`, based on the supplied screenshots. Confirm these symbols match MoneyTrail's `normalized_symbol`; don't silently map unrelated instruments. Prices are displayed in USD, matching the inspected MoneyTrail price contract. Confirm that contract on this deployment before treating quotes as usable. There is no currency conversion.

Defaults: weather and MoneyTrail fetch every **900 seconds**; phone checks its Mac every **60 seconds** while the UI runs. A fetch does not force MoneyTrail to generate fresh scores or quotes. Change `refresh_seconds` if needed; minimum 60 seconds. Restart after changing config:

```sh
python3 scripts/mac-service.py restart
python3 scripts/mac-service.py status
```

Read access required: `public_opportunity_action_board` (all pages, 500/page) and optionally `market_candles` (`symbol`, `interval=1d`, newest closes). No writes to Supabase. API errors keep last good data; the UI marks the cache. Verify `/health` with the generated certificate, not `curl -k`:

```sh
curl --cacert "$HOME/Library/Application Support/HomeDash/server.crt" \
  --resolve HomeDash:8765:127.0.0.1 https://HomeDash:8765/health
```

If local curl requires Subject Alternative Names, use a verified Python SSL context with this certificate and `server_hostname='HomeDash'`, or verify the service through the paired app. Never disable upstream HTTPS verification. The service uses Python's trust store plus `/etc/ssl/cert.pem` on macOS.

## 3. Pair the Seeker

The phone needs APK **0.2.0-preview** or newer. On the dedicated Mac, in a **private local terminal**:

```sh
python3 scripts/mac-service.py pairing
```

This intentionally displays the device token: do not run it in a shared chat/log. On the phone open **Settings → Connect to Hermes Mac**. Enter:

1. `https://<dedicated-Mac-LAN-IP-or-hostname>:8765`
2. The displayed SHA-256 certificate fingerprint.
3. The device token.

Save. The app pins that exact certificate, rejects expired/replaced certificates and redirects, and stores the token encrypted using Android Keystore. Only bundled UI content can call the fixed dashboard endpoint. Internet permission is enabled; cleartext HTTP remains disabled. The development APK still uses a development signing key; production signing remains a later migration.

Confirm live Sydney weather, expected watchlist symbols/scores, original quote/evidence ages, and available chart history. Missing data must stay missing. Turn off Wi-Fi briefly: the last snapshot should stay visible with **CACHED · OFFLINE**, then recover after reconnect. Reopen the app to check cache persistence. At first sync there are no change alerts: it establishes a baseline.

To rotate a compromised device token, replace `device-token` locally with a new random 32+ character URL-safe secret, restart, and re-pair. Certificate renewal also requires re-pairing. The generated certificate is valid for 825 days; plan renewal before expiry. Use **Disconnect** to clear pairing and the phone's cached live snapshot and return to demo mode.

## 4. Publish Hermes briefings

Hermes can publish through a local CLI. No plugin API or Telegram output is required. Create a UTF-8 JSON file **outside the Git checkout** containing the full current briefing list (maximum 30):

```json
[
  {
    "id": "morning-2026-09-30",
    "title": "Morning briefing",
    "published_at": "2026-09-30T08:00:00+10:00",
    "body": [
      "Replace this example with a verified summary.",
      "Include original source names, URLs and relevant publication times as plain text."
    ]
  }
]
```

Do not publish the example as real news. Keep a stable ID for each briefing; a new ID becomes unread. The supplied list atomically replaces the current list. To clear briefings publish `[]`. Source text is rendered as text, never HTML. URLs are visible plain text; external navigation is not enabled in this version.

```sh
python3 scripts/mac-service.py publish /absolute/path/to/current-briefings.json
```

The phone sees it on its next poll. Hermes may run this after an explicitly requested Telegram-group task or as part of an approved morning/evening job. **Do not create schedules or send Telegram messages automatically during installation.** This release implements briefings, not live reminder acknowledgements; demo reminders are hidden once paired. Real reminders and Done/Snooze sync remain the next integration.

## 5. Update and rollback

Fetch and inspect a new commit; rerun tests, then `install <new-sha>`. State, certificate and device token are preserved. `python3 scripts/mac-service.py rollback` installs the recorded previous commit from this checkout; keep that commit available locally. These commands restart the service. This release uses additive cache tables and no destructive migrations. Back up the state directory locally before future schema migrations.

To stop: `launchctl bootout gui/$(id -u)/local.home-dash.service`. Remove the matching LaunchAgent plist only if intentionally uninstalling. Keep state for recovery. Do not delete or alter other launch agents.

## Report back, without secrets

Return the deployed commit, Python version, launchd status, whether weather/market/chart reads succeed, row count and symbol list, observed quote/evidence age, and whether the phone recovered after Wi-Fi loss. Report permission errors without dumping keys or headers. Real MoneyTrail access, the dedicated Mac launchd lifecycle and phone-to-Mac LAN pairing must be validated there; development tests cannot establish those facts.
