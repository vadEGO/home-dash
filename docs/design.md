# Agreed design and implementation boundary

## Device and presentation

Existing Solana Seeker; USB-C power; landscape; black future magnetic cradle. Market Terminal appearance with warm light and near-black dark themes. Sydney sunrise/sunset selects automatic theme; manual overrides persist.

Home: Sydney weather and time left, London/Marseille/Minsk times beneath. Personal fixed-order watchlist right: USD sample quotes, existing MoneyTrail composite score, explicit Long/Short direction, seven-day chart and change. Keep score semantics separate from direction and market movement. Never convert missing scores to zero.

Watchlist slowly scrolls all assets with headings fixed, pauses at both ends and on touch, supports manual scroll, resumes after 15 seconds, and has an off switch. Optional 30-second page rotation waits for watchlist completion and pauses for interaction. Default: rotation off.

Header: reminders have priority; otherwise a slow Hermes briefing line with access to full text. Prototype reminders are opt-in local demonstrations. Production timing and expiration rules still need a server contract.

Ideas page: top-ranked and meaningfully changed ideas. Briefings page: summaries, unread indication, future source links and publication times. No order execution or agent investigation actions in the first iteration. Notifications are intended for the app, not automatic Telegram posts.

## Architecture

User controls Hermes from a Telegram group. Dedicated Mac hosts future Python/SQLite dashboard service, independent of Hermes's environment. Deploy service and Hermes plugin through Git at an explicit release version. App installs separately via USB APK. Keep provider credentials on Mac and issue restricted phone credentials when pairing is implemented.

Existing MoneyTrail public repository was inspected during planning: `/ideas` redirects to unified board; portfolio is research guidance, not personal holdings. Use watchlist read models, preserve source identities and separate freshness clocks. Source integration remains unimplemented.

## This milestone

Deliver a self-contained APK with real UI interactions and time-zone calculations. Demonstration content must remain visibly labelled. Do not install services, schedule real reminders, alter Telegram, modify MoneyTrail or publish an external repository as part of this milestone.

## Next milestones

1. Finalise actual watchlist, source mapping, freshness policies, reminder timing and briefing expiration.
2. Implement/read-test MoneyTrail and weather adapters on the Mac; add cache and authentication.
3. Implement Hermes publish tools and repeatable native macOS deployment/recovery scripts.
4. Connect Android transport, authenticated pairing, cache and offline action reconciliation.
5. Test full workflow, unplug/replug, network loss, process/device restart and extended display usage.
6. Publish reviewed release to a separate Git repository and hand deployment to Hermes.
