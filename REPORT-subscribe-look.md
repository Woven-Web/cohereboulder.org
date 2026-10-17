# Report: subscribe-look

**status:** completed. Nothing deployed, pushed, sent or touched in Docker or production.

## Summary

### 1. The Subscribe to calendar dialog wears the ecology look

The dialog portalled to `<body>`, outside the `.alm` shell, so it got shadcn's blue buttons and the
system font. It now mounts in the shell the same way the sign-in dialog does (`useShell().container`)
and shares that dialog's card: cream background, 24px corners, Lora title, Poppins text. Google is the
forest pill. Apple and Copy are outlined forest pills. Tap targets are 48px and the close button is
labelled in both languages (`nav.closeDialog`). The address input stays at body size (16px or more),
so iOS doesn't zoom into the dialog when someone taps it.

- `src/components/CalendarSubscribe.tsx`: the container, close label, and `signin-dlg subscribe-dlg` classes.
- `src/styles/ecology.css`: the `.subscribe-dlg` button and input rules, next to the sign-in dialog's rules.
- Screenshots in `shots-subscribe/`: event page EN/ES and Calendar EN at 390 and 1280, plus the old dialog
  (`before-*`). All were taken from the real build on the local Worker and the regenOS mock.
- Like the sign-in dialog, the rules are scoped to `.alm` rather than `.alm.eco`. Under `?look=classic`
  the dialog therefore takes the almanac tokens, not shadcn's.

### 2. Why `ecology-e2e.mjs:362` ("Remind me") was flaky

The cause is a split clock, not push state or the install offer. The test freezes the browser clock at
2026-10-10, before the gathering. The Worker's `/api/companion/today` uses the **real** Denver date. The
lane's fixture (`scripts/fixtures/look-companion.sql`) seeds a practice for the real "now", so the
Worker answers with `daily` set. Today's rule is "published content wins"
(`phase = daily ? 'during' : …` in `src/pages/Companion.tsx`), so the page flips from the "before"
layout, which has the Remind me button, to the "during" layout, which doesn't.

`page.goto(…, {waitUntil:"load"})` returns before the API calls even start. The button exists from first
paint until the answer renders, about 50–100 ms locally. The test passed when Playwright looked inside
that window. On a loaded CI runner it sometimes looked too late, and then it waited 30 s for a button
that never came back. I measured this with a probe: the button was there at load, the answer arrived
47 ms later, and the next look found the "Learn three neighbours' names" practice and no button.

The fix is in the test only (`scripts/ecology-e2e.mjs`):
- The before-gathering session answers `/api/companion/today` as the Worker would on Oct 10. It
  fetches the real reply from the Worker, then sets `date` to Oct 10, `daily` to null, and keeps
  only the quests open on Oct 10.
  Clocks are what we're allowed to fake, and other lanes (`redesign-e2e`, `companion-e2e`) already
  pin this endpoint.
- It asserts the **settled** page, not the first paint. An init script flags when the page has read
  that JSON plus two `setTimeout(0)`s, which is after React Query hands the result to React and React
  renders. The test waits for that flag before checking.
- It now also checks that the heading counts down ("5 days"). Nothing it checked before was weakened.

**Not an app bug for real users:** the client and Worker clocks agree, and the Worker has no content
before Oct 15. One thing to note: Today trusts `daily` without comparing `data.date` to the device's
own date. On a device with a wrong clock the page could show another day's practice. I left that
alone, as the brief says.

## Checks (what I ran, what it returned)

- `npm run typecheck`: exit 0.
- `npm test`: `Test Files 69 passed | 1 skipped (70)`, `Tests 983 passed | 1 skipped (984)`.
- `npm run lint`: `✖ 8 problems (0 errors, 8 warnings)`, all in files I didn't touch (`src/components/ui/*`, `LanguageContext.tsx`).
- `npm run build`: `✓ built`.
- `E2E_PORT_OFFSET=3200 bash scripts/ci-e2e.sh`, twice in a row, on the final commit: both exit 0 with
  "All hermetic e2e scripts passed." Both include `ecology-e2e: all checks passed`, the 2 "today: before…"
  checks and 32 subscribe checks.
- **The new tests can fail:**
  - A copy of `ecology-e2e.mjs` without the route, run twice on fresh servers: both runs failed at the Remind me wait
    (`locator.waitFor: Timeout 5000ms exceeded … 'Remind me'`). The fixed script passed twice on the same setup.
  - I reverted `CalendarSubscribe.tsx` and `ecology.css`, rebuilt, and ran the lane. It failed:
    `FAIL subscribe: the dialog mounts inside the ecology shell`, `FAIL … Lora title, Poppins buttons (ui-sans-serif)`,
    `FAIL … forest pill (rgb(55, 86, 144), rgb(148, 163, 184))`. Restoring the change made it pass.
- `/code-review` on the branch's diff. Fixed: the input font size (iOS zoom), a guard for URL-less
  responses in the test hook, passing a failed companion answer through, and covering the Calendar
  page's button.

## Artifacts

- Commits on `fix/subscribe-look`: `81717a6` (deterministic Remind me check), `8a3c5ad` (dialog look and lane
  checks), `31fd511` (review fixes), and this report with the walkthrough.
- `shots-subscribe/*.png`, `WALKTHROUGH.md`.

## Open

- The "settled" signal depends on React Query 5's `setTimeout(0)` notify scheduler (5.83.0 here). If a
  later upgrade changes that scheduler, the wait could end before the render and the check would look at
  first paint again. It would not fail falsely. A sturdier signal would need an app-side marker such as
  `aria-busy` on Today's `<main>`, which I didn't add because the brief limits app changes to real bugs.
  Owner: whoever next upgrades React Query.
- The dialog's long `DialogContent` className is now copied in two places (`AccountControl.tsx` and
  `CalendarSubscribe.tsx`). A small shell-dialog wrapper would remove the duplicate. Owner: next change
  to either dialog.
- One process slip during the run: a stray `git checkout HEAD~1 -- .` reset my uncommitted edits. I
  restored them from a saved patch and re-applied the script edits. The diff matched before I committed,
  and every check above ran on the committed tree afterwards.
- Next: open a PR, deploy to staging, and have the organizers look at it. Owner: Uni or Aaron.
