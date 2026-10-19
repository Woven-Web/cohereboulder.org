# Report: masthead flash, calendar first paint, week titles, view in the URL

Branch `fix/flash-calendar` (from upstream/main `21a228c`). Brief: `CLAUDE-TASK-flash-calendar.md`.

## Status

**Completed.** Nothing was deployed or pushed, and nothing was sent. There were no production writes, and Docker was not touched.

- All testing ran on local stacks I started: the walk stack (`scripts/walk-oct19-stack.sh`, ports 23610–23613) and the e2e lanes' own stacks. At the end I stopped only those.
- Production was only read, and only to size the wait in fix 2:
  - one anonymous `GET https://cohereboulder.org/api/events`: 32 upcoming events, 0.13 s;
  - three anonymous `GET /xrpc/social.scenius.getEventAttendance`: each answered 400 (my parameter names were wrong) in 0.31–0.59 s. That is a round trip through the proxy to regenOS.

## Summary

| # | What was wrong | Fix | Proof |
| --- | --- | --- | --- |
| 1 | A signed-in member saw "About · Join COhere · Sign in" for about 0.75 s, then "Register for the gathering · their handle". The calendar's host card said "You don't need an account…" to them first. | While the site is still asking who this is, a device whose last answer was "signed in" keeps those places empty: same size, `visibility:hidden`, `aria-hidden`. The Register button also waits, hidden, while a member's registration is read. The host card waits until the answer is in. | `01-masthead-*`, `02-calendar-phone-300ms-*` |
| 2 | Calendar first paint: "Loading events…" with the host card and the footer under it, all pushed down when the list landed. Layout shift was 0.35–1.18. | The day trail is drawn from the start. The list, the host card and the footer arrive together, once the events and who this is are known (plus, for a member, their RSVPs, with a bounded wait). Layout shift is now 0.0008–0.008. | `02-*`, `03-*` |
| 3 | The week beside Your next broke titles inside words: "Watershe d Walk", "Communi ty Potluck". | Each word is its own inline box, so lines break only between words. A word wider than its chip ends in "…" in Chromium and Firefox. The chip's tooltip is the full name. | `04-week-grid-1280-*`, `06-week-narrow-firefox-after.png` |
| 4 | Picking Week didn't change the URL; a reload with `?day=` showed Day. | The view is in the URL: `?day=…&view=week`. Picking Day writes `view=day`. "Show every date" is `?view=day` with no day, and a reload keeps it. Other parameters (`look`, `trail`) are kept. | `05-url-week-after-reload-*` |

### Measured on the local stack (`scripts/flash-calendar-check.mjs`)

Member Pia (`mock-peer`), RSVP'd to two events. Her session answer is slowed by 0.6 s.

| | before | after |
| --- | --- | --- |
| CLS, member, 390 | 1.1801 | 0.0008 |
| CLS, member, 1280 | 0.5272 | 0.0080 |
| CLS, visitor, 390 | 0.9327 | 0.0010 |
| CLS, visitor, 1280 | 0.3507 | 0.0011 |
| Member's masthead at 1280, in order | "About · Join COhere", then "About · Join COhere · Sign in", then "Join COhere · pia.mock.test", then "Register for the gathering · pia.mock.test" | empty, then "pia.mock.test", then "Register for the gathering · pia.mock.test" |
| Week titles split mid-word | Watershed, Community | none |
| Pick Week, then reload | `?day=2026-10-21`, shows Day | `?day=2026-10-21&view=week`, shows Week |

### How it works, and what that means for people

- **The signed-in hint.** `cohere.signedIn` in localStorage is set whenever the session read names someone, and cleared when it doesn't, when it fails, and on sign-out.
  - Only a device with the hint gets the empty placeholders.
  - A first-time or signed-out visitor sees "Join COhere" at once, exactly as before. I chose this so the Register button never waits for regenOS, since registration is the tiebreaker.
  - The cost: on each member's device, the first load after this ships still flashes once, because the hint isn't set yet.
- **The hold is capped at 3 s** (`AUTH_HOLD_MAX_MS`). If regenOS stalls, the signed-out controls come back, so the masthead is never left empty.
- **Remembered RSVPs.** A member's RSVP answers are kept on the device (`cohere.mySeats.v1`: event keys and seats for one DID, cleared on sign-out). Looking them up costs one regenOS call per upcoming event: 32 now, 4 at a time, so about 8 round trips.
  - A returning member's calendar is laid out from the remembered answers at once, and the real lookups correct it afterwards.
  - With nothing remembered, the list waits at most 1.2 s for the lookups, then shows without them. In that case the page can still move once when they land (see Open).
- **The list waits for who this is only on a device with the hint.** A visitor's list is never held for the session read.
- **Readiness latches.** After the first full paint, later refetches (a delete, a sign-in, a new RSVP) never blank the page again.

### Files

- `src/hooks/useRegenos.ts`: `useAuthState` (pending / hold / settled), the hint, and the 3 s cap.
- `src/components/RegistrationAction.tsx`, `AccountControl.tsx`, `almanac/SiteChrome.tsx`: the placeholders. Sign-out clears the hint and the remembered RSVPs.
- `src/pages/Calendar.tsx`:
  - the first paint;
  - the host card and footer gate;
  - the view in the URL (`goTo` keeps other parameters and drops `mine`, as picking a day already did);
  - `AlmanacShell` takes `footer={false}` while loading.
- `src/lib/myEvents.ts`: the seat cache (`parseSeatCache`, `forgetSeatCache`, `placeholderData`).
- `src/components/almanac/CalendarWeek.tsx`, `src/styles/ecology.css`: the word boxes and the ellipsis. Chip and column padding are 5 px narrower in all, so more words fit whole.

## Checks (final tree, `edae87b` plus the report commit)

- **`npm run typecheck`:** exit 0.
- **`npm test`:** `Test Files 73 passed | 1 skipped (74)`, `Tests 1017 passed | 1 skipped (1018)`. That is 15 new tests; the baseline was 1002.
- **`npm run lint`:** `✖ 8 problems (0 errors, 8 warnings)`. These are the existing warnings in `src/components/ui/*` and `LanguageContext.tsx`.
- **`npm run build`:** `✓ built in 2.46s`.
- **`E2E_PORT_OFFSET=3800 bash scripts/ci-e2e.sh`** on `edae87b`'s build: `All hermetic e2e scripts passed.`, exit 0, 0 FAIL lines.
- **The laptop-calendar lane** (`scripts/calendar-desktop-e2e.mjs`, run inside ci-e2e) has new checks:
  - view in the URL: Week, the step to the other week, Day, Show every date, and a reload after each; other parameters kept;
  - first paint at 390 and 1280, for a visitor and a returning member: CLS under 0.1, and no signed-out words in the masthead or host card;
  - the hint is written;
  - remembered RSVPs with lookups slowed to 3 s: Your next in about 0.9 s, CLS under 0.1;
  - nothing remembered: the list in about 1.4 s, before the lookups end;
  - a stalled session: the masthead holds, then shows its controls after 3 s;
  - week titles beside Your next: no word split, and the long word cut with an ellipsis.
- **New tests shown to fail first:**
  - The lane, run against a build of `21a228c`: `15 check(s) failed`. Every new check failed: URL ×5, CLS ×4 (0.36–0.64), hint ×2, masthead ×2, and week titles ×2 ("Invocation", "Supercalifragilisticexpialidocious, Gathering, Watershed" split).
    - One exception passed there anyway: on the old build the host-card check finds no host-card id, so it can't fail. `flash-calendar-check.mjs` does catch the host-card wording on the old build.
  - `MastPlaceholder.test.tsx`: 4 of 6 fail with the old `SiteChrome`, `AccountControl` and `RegistrationAction`. The 2 that pass describe the settled state, which hasn't changed.
  - `useRegenos.test.ts`: 3 of 4 fail with the hint writes removed.
  - `almanac.test.tsx` "CalendarWeek titles": fails on `1e82b55`'s component.
- **`flash-calendar-check.mjs`:** `before` gives 11 failed checks (exit 1); `after` gives `all checks passed` (exit 0).
- **Firefox 153** (installed for this with `npx playwright install firefox`): before the per-word boxes, the week cut "Watershe" with no "…". After, "Waters…" in both browsers (`06-week-narrow-firefox-after.png`, grid narrowed on purpose). Safari was not tested.
- **`/code-review`** of `21a228c..1e82b55` raised 10 findings. I fixed 7 in `edae87b`:
  - an unbounded wait on the session;
  - an unbounded placeholder hold;
  - the seat cache applied while lookups were off, and read on every render;
  - URL writes dropping `look`;
  - "every date" not in the URL;
  - Firefox drawing no ellipsis;
  - the seat cache and hint kept after sign-out.

  Not fixed:
  - the staging shift (see Open);
  - folding the older hooks (`useMyRegistration`, `useMe`, `useMyEvents`) into `useAuthState`: a refactor with no behaviour change;
  - the e2e asserting a computed style rather than a painted "…": I checked the paint by eye in both browsers instead.

## New strings

None. The placeholders reuse the existing labels, hidden. The loading line is the existing `calendar.events.loading` ("Loading events…" / Spanish unchanged).

## Video and stills

- **`shots-flash/tour.mp4`:** 86.5 s, 2.2 MB, 1280×720, H.264 + AAC, Kokoro voice `af_heart`. Six scenes: title, masthead, first paint, week titles, URL, and "Still open".
  - Encoded with `-map_metadata -1 -fflags +bitexact -movflags +faststart`. The x264 settings string was removed with `filter_units=remove_types=6`.
  - What remains: the `isom` brand fields, `language=und`, and the muxer's `VideoHandler`/`SoundHandler` handler names.
  - `moov` is at the front, and a full decode passes.
- **Narration check:** faster-whisper (tiny) transcribed it back line for line ("co-hear", "weak" for "week"). Nobody has listened to it by ear.
- **Stills:** `shots-flash/NN-name-{before,after}.png`.
- **Scratch (gitignored):** `shots-flash/raw/` holds the captures, the check JSON, `video/compose.py` / `narrate.py` / `encode.sh`, and the e2e logs.

## Open

- **A member's first load on a device after this ships still flashes once.** There is no hint yet. Owner: none; it fixes itself.
- **Worst case for layout shift:** a member on a device that remembers none of their RSVPs, with slow lookups. The list shows at about 1.2 s, then moves once when the lookups land: CLS 0.16 at 1280 and 0.22 at 390, measured in the lane with 3 s lookups. That happens on a member's first calendar visit on a device, or after they RSVP elsewhere. Reserving the Your next column for signed-in members would close it. That is a layout decision. Owner: Aaron / Eileen.
- **Staging** (sign-in off): every load reserves the hidden Sign in place until `/api/config` answers, then drops it, which is a small masthead shift. Production has sign-in on, so it doesn't happen there.
- **At 1024–1279 with Your next beside the Week,** columns are narrow, and longer words end in "…" ("Morni…", "Commu…"). No word splits now, but stacking Your next above the Week would show whole titles. That is a layout decision. Owner: Aaron / Eileen.
- **The laptop masthead's tab icons shrink to dots** when "Register for the gathering" and a handle share the row at 1280. This was already the case before this pass (`01-masthead-member-1280-settled-before.png`).
- **Not verified:**
  - Safari, and iOS private mode, where localStorage throws. The code falls back to no hint and no remembered seats; I read that from the code but didn't run it.
  - Real production timing for a signed-in member. Everything here ran on the mock.
