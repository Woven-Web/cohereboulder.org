# T-399 progress (attempt o044r28l)

Goal: get PR #84 (festival-archive calendar) through the deploy gate and live.

## Cause (confirmed)
- calendar-desktop + ecology lanes: browsers are pinned to Oct 16/17, but the Worker's /api/events
  filters by the real clock and drops events ended >14 days ago. After ~Oct 31 the lanes' October
  mock events vanished. Date-bound, not #84's view logic.
- companion lane: the rollover step hardcoded Denver midnight as 06:00 UTC (MDT). After DST ended
  Nov 1 it's 07:00 UTC, so the clock never crossed midnight.

## Done
- worker/src/events.ts: listingNow(env) — E2E_LISTING_NOW pins the listing clock, only while
  REGENOS_BASE_URL is a loopback mock (production reads scenius.social). Unit test proves the guard.
- calendar-desktop-e2e.sh and ci-e2e.sh lane 14 pass the pin matching each lane's browser clock.
- companion-e2e.mjs: rollover computes Denver midnight for the date (06:00 or 07:00 UTC).
- calendar-desktop lane green locally.

## Next
- Full ci-e2e green; typecheck/test/build; PR; Check pull request; merge; deploy; live read + screenshot.
