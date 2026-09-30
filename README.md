# Home Dash — preview 0.4

Landscape fridge dashboard for an existing Solana Seeker, with a separate service on the dedicated Hermes Mac. No app store or Docker required.

## Included

- Sydney weather from Open-Meteo, local clock and London / Marseille / Minsk clocks with DST handling.
- MoneyTrail watchlist with original composite scores, direction, quote/evidence timestamps and conflict flags. Missing values remain unavailable.
- Seven-day sparklines when eight consecutive recent daily closes are accessible. No synthetic production charts.
- Boxed trade ideas with entry/thesis previews. Tap for Overview, Levels, Thesis and Sources, with previous/next navigation.
- Entry zone, stop, three targets, no-chase threshold, invalidation, alternative views (up to eight), source details and score breakdown, preserving supplied values and freshness.
- Top current ideas and substantive changes observed since the initial baseline.
- Hermes briefings published through a local CLI; unread state and scrolling header ticker.
- Persistent Sydney-time reminders with Home cards and Done/Snooze, plus a shopping list with check-off/Undo. Offline actions survive restarts and sync back to the Mac.
- Light/dark themes, approximate Sydney sunrise/sunset switching, slow watchlist scrolling, touch pause, swipe navigation and optional page rotation.
- Native HTTPS pairing with certificate pinning, Android Keystore token encryption and persistent offline snapshots.
- Versioned Mac install/update/rollback, launchd restart after login, isolated Python runtime and SQLite cache.

**Deployment guide:** [docs/hermes-deploy.md](docs/hermes-deploy.md). Build here; Hermes deploys from Git on the dedicated Mac. The upgraded APK is installable now, but real MoneyTrail data requires that Mac's configuration and pairing. An unpaired phone displays clearly labelled demo content.

## Build and install Android

Requires Android SDK Build Tools 36.0.0, platform android-37.0, and Android Studio's JDK. The APK targets API 36, minimum API 26. Plain JavaScript UI plus native Java WebView shell, with no web package dependencies or Gradle download.

```sh
node --test tests/core.test.cjs
bash scripts/build-apk.sh
~/Library/Android/sdk/platform-tools/adb install -r dist/fridge-dashboard-prototype.apk
~/Library/Android/sdk/platform-tools/adb shell am start -n local.fridge.dashboard/.MainActivity
```

`ANDROID_HOME` and `JAVA_HOME` override the default SDK/JDK paths. Preserve `.signing/prototype.keystore` for in-place updates. It is a **development-only** key with a known password, excluded from Git. Production signing needs a separately managed key and migration decision before wider distribution. APK version: `0.4.0-preview`; filename retains the prototype name.

## Service and tests

Python 3.11.8+ standard library only. The Mac installer creates a separate venv without installing packages. State and credentials live outside Git in `~/Library/Application Support/HomeDash/`.

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/core.test.cjs
# Optional: Playwright + Chromium, used only for UI testing.
node tests/ui-check.cjs
node tests/live-ui-check.cjs
node tests/trade-details-check.cjs
node tests/tasks-ui-check.cjs
```

Set `PLAYWRIGHT_MODULE` to an existing module path if using a shared runtime. HTTPS tests create a temporary localhost service and certificate, then remove them; they do not install launchd jobs. Backend tests cover source failure/cache retention, timestamp preservation, missing data, chart completeness, ranking, change detection, pagination, auth rejection, TLS trust, deployment state preservation and briefing validation.

## Personal watchlist

The ordered 18-asset list is in `backend/watchlist.json`. New installs use it; existing installs apply it with `python3 scripts/mac-service.py watchlist backend/watchlist.json`, then restart. This preserves credentials. Unresolved instrument mappings remain visible without substituted quotes or scores. See the deployment guide for pending identity checks.

## Data semantics

The MoneyTrail adapter uses `public_opportunity_action_board`, matching the inspected dashboard read model. For each watchlist symbol it selects by action state, descending score, confirmations, then ID. The watchlist can include research needing review; detail views show original statuses and timestamps. Ideas require MoneyTrail's current-idea freshness fields, a positive price and a quote no older than seven days, then rank by composite score. The app does not calculate investment scores or place trades.

Price, evidence, review and fetch timestamps remain separate. MoneyTrail does not expose a dedicated score calculation time here. The seven-day change uses daily closes rather than the current quote, and disappears if that history becomes old. The first sync establishes a change baseline; subsequent changes to the selected idea, score, bias, state, thesis, rationale evidence confirmation time, entry/exit levels or invalidation qualify. Export time alone does not.

Fetch intervals default to 15 minutes on the Mac and one minute on the phone. They do not control MoneyTrail's upstream research or price updates. Open-Meteo attribution appears in Settings. Weather is fixed to central Sydney.

## Remaining limits

- The dedicated Hermes Mac's launchd lifecycle, real Supabase permissions and LAN pairing need deployment verification. No production credentials were available on the build Mac.
- Hermes CLI publishing is implemented; no Hermes plugin or automated news schedule is installed. Briefing URLs display as text.
- Live reminders and shopping are implemented for the foreground app, including offline Done/Snooze and check/Undo. Hermes must deploy the backend and adopt [the task workflow](docs/hermes-tasks.md). No closed-app alarms or notifications are implemented.
- Screen remains awake while charging; normal phone timeout applies on battery. No brightness/charging policy, wake scheduling, automatic phone launch or lock bypass is implemented.
- Automatic theme uses an approximate local solar calculation. Extended AMOLED/heat/battery operation still needs real-device observation.
- Mac HTTPS is intended for the home LAN. Certificate expiry/renewal and key rotation require re-pairing. See the deployment guide.

## Validation on the build Mac

Python, core JavaScript and browser tests pass. A real Sydney weather request succeeded with verified TLS. APK built, signature verified and installed on the connected Android 16 Seeker. Production MoneyTrail, launchd recovery and native phone-to-dedicated-Mac pairing are pending the Git handoff.

## Reopening the phone app

Find **Fridge Dashboard** in the app drawer (mint fridge/chart icon on a dark background). Tap it to reopen after closing it. Long-press the icon and drag it onto the home screen for quicker access. Adaptive icons also support Android themed icons.
