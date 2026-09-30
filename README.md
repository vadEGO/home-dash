# Fridge Dashboard — prototype 0.1

An offline, sideloaded landscape Android dashboard for the Solana Seeker. Built from the approved Market Terminal concept.

## What works

- Live Sydney clock and London, Marseille, Minsk clocks with independent time-zone/DST handling and relative day labels.
- Approximate Sydney sunrise/sunset automatic theme, with persistent light/dark overrides.
- Eight demo watchlist assets, scores, direction, illustrative seven-day sparklines, slow vertical scrolling and touch pause.
- Home / Ideas / Briefings navigation, horizontal swipe and optional page rotation after the watchlist has finished.
- Demo briefings with unread state and a scrolling header ticker.
- Optional local demo reminder with Done and ten-minute Snooze. Reminder takes priority over the ticker.
- Immersive landscape display; screen held awake while plugged in, normal system timeout on battery.

## Explicit limitations

Weather, prices, scores, chart history, trade ideas and briefings are **sample data**. No Hermes or MoneyTrail API is connected. The APK has no internet permission and the web content blocks network connections. Demo reminder state is local to the phone, not a real schedule or notification service. Snoozed reminders reappear when this app is active; no background alarms are implemented.

The app does not change system brightness, charge limits, lock settings or startup behaviour. Screen sleep scheduling and automatic launch after reboot remain later work. The phone must be unlocked to use it. Battery longevity and always-on behaviour need extended device testing.

This first build uses a small plain JavaScript UI in a native Java WebView shell, rather than introducing React/Vite before validating the layout. It has no web package dependencies. A later framework migration is optional; the data interfaces should remain independent.

## Build

Requires macOS, Android SDK Build Tools 36.0.0, platform android-37.0, and the JDK bundled with Android Studio. The resulting APK targets API 36 (Android 16) and supports API 26+. The build script uses the installed SDK tools directly; no Gradle download is needed.

```sh
node --test tests/core.test.cjs
bash scripts/build-apk.sh
~/Library/Android/sdk/platform-tools/adb install -r dist/fridge-dashboard-prototype.apk
~/Library/Android/sdk/platform-tools/adb shell am start -n local.fridge.dashboard/.MainActivity
```

`ANDROID_HOME` and `JAVA_HOME` can override SDK/JDK locations. Output: `dist/fridge-dashboard-prototype.apk`.

Optional browser interaction checks require Playwright plus Chromium: `node tests/ui-check.cjs`. Set `PLAYWRIGHT_MODULE` to an existing Playwright module directory if using a shared runtime. The app itself does not require Playwright.

The generated `.signing/prototype.keystore` is a **development-only** signing key with a known password. Keep it outside Git. A production release needs a separately managed private signing key and a migration decision before deploying real state. Preserve this prototype key for in-place development updates.

## Project structure

- `web/`: bundled UI, styles, sample content and clock/solar calculations.
- `android/`: manifest and native WebView activity.
- `scripts/`: APK build pipeline.
- `tests/`: time-zone, theme and data handling checks.
- `docs/`: approved scope and future Git/Hermes handoff.

## Deployment direction

Repository: [vadEGO/home-dash](https://github.com/vadEGO/home-dash). Hermes on the dedicated Mac will eventually deploy an explicitly tagged release using versioned install/update/status/rollback scripts. This initial version contains the phone prototype and build instructions; backend deployment scripts and the Hermes plugin are not implemented yet. Secrets, local databases and signing keys must not enter Git.

Next integration: a separate local Python/SQLite service, authenticated phone pairing, a read-only MoneyTrail adapter preserving independent quote/research timestamps, Sydney weather, and a supported Hermes publishing plugin. Neither the Hermes runtime nor MoneyTrail production was modified.

## Validation — 30 September 2026

APK built and signature verified, installed and opened on the connected Seeker running Android 16. User confirmed rendering after unlocking. On-device screenshots verified Home in both themes, Ideas, and Settings. Five core tests passed. Browser interactions passed for auto-scroll, touch pause, saved theme, page navigation, unread briefing state, demo reminder snooze/expiry/completion, with no JavaScript errors. The source-built revision containing the scrolling fix was reinstalled. Long-duration operation, real network integration and automatic recovery remain untested.
