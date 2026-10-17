# Walk report: COhere app, live and on the regenOS mock

Branch `walk/live`. Walked 2026-10-16 (day 2 of the gathering). Nothing deployed, pushed or sent. The live site was
only read: `scripts/walk-live.mjs` aborts every request that is not a GET, never signs in, never submits.

## What I walked

| | Where | Sizes | Languages | Screens |
| --- | --- | --- | --- | --- |
| Live, read-only | https://cohereboulder.org, shots in `walk/live/` (112) | 1280×800, 1440×900, 1024×768, 390×844 | EN, ES | Home, Today, Calendar Week, Day today (Oct 16), Day past (Oct 15), Day future (Oct 19), event past, event future, About, Register (view), Board and People signed out, Me, Login; plus the sign-in dialog at 1280 and 390 (EN) |
| Local mock, signed in | `scripts/walk-mock.mjs` via `calendar-desktop-e2e.sh` (`WALKMOCK=1`), shots in `walk/mock/` (188) | same four | EN, ES | Sign-in dialog and "check your email" step, Home, Today, Calendar Week/Day/past day, Register (edit), People, Profile, Me, Notifications, Propose, Board and a Board post composer, a future event with an RSVP, a past event with a harvest shared, edited via the ⋯ menu, and deleted (every step shot) |

`walk/pairs/` holds the before/after pairs below. "Before" is the live site or the unchanged branch head (`c384a1b`) on
the same mock data; "after" is this branch.

## Findings

Fixed = y/n. Widths in px. "Live" = seen on cohereboulder.org; "mock" = seen signed in on the local mock.

| # | Screen | Width | What a newcomer sees | Fixed |
| --- | --- | --- | --- | --- |
| 1 | Sign-in dialog (Calendar, any page with Sign in) | all | Generic sans-serif title, grey card, orange gradient button: nothing like the rest of the site (known) | **y** |
| 2 | Calendar, inline sign-in card (phone) | 390 | Blue border, rust button | **y** |
| 3 | Event page, ended event | all | Share event and Add to calendar still offered after the event is over (known) | **y** |
| 4 | Calendar Day, a day with a lone card (Oct 15) | 1024–1440 | One card uses the left half; the right half of the page is empty (known) | **y** |
| 5 | Calendar Day, mixed-height cards (Oct 16) | 1024–1440 | Two columns of cards of different heights leave ragged holes under the short ones | **y** |
| 6 | Masthead in Spanish | 1024 | Wordmark runs over "Inicio" and "Quiénes somos" runs over "Gente" | **y** |
| 7 | Masthead tabs in Spanish | 1280–1440 | Six tabs are 5 px wider than their box (script) | **y** |
| 8 | Bottom tab bar in Spanish | 390 | "Calendario" is wider than its cell (71 px in 65) | **y** |
| 9 | Calendar and others: "Sign in" link, sparkle icon, callout text | all | Classic blue (`--primary`, `--muted-foreground`, `--border`) next to the forest-green look | **y** |
| 10 | Me (and any visitor without notifications on) | all | "Turn off notifications" is offered to someone who never turned them on; with "Blocked in settings" above it | **y** |
| 11 | Event page, future event | 390–1440 | A host's text hard-wrapped mid-sentence shows as ragged one-line fragments | **y** |
| 12 | Home | 1280, 1440 | "Already registered? Sign in" is centred under a left-aligned Join button | **y** |
| 13 | Today, signed in (mock) | 1280, 1440 | Left column ends early, right column holds everything else; empty right-hand space (known) | **y** |
| 14 | Board, signed in (mock) | 1280, 1440 | A 160 px empty band to the right of the title and section tabs before the feed starts | **y** |
| 15 | Calendar, signed in but not registered (mock) | all | "Register for the gathering" is plain text, not a button | **y** |
| 16 | Calendar | all | Two events named **TEST** are on the public calendar today (rkeys `ev-mvbhkv5jgyjsp8` 3:36 PM, `ev-mvbk702za9fbsm` 4:50 PM MDT) and show Harvests buttons | n: deleting is a production write; an organizer needs to remove them |
| 17 | Home | all | Two different "Join COhere" buttons on one screen (rust in the masthead, forest in the hero) | n: design call for Eileen |
| 18 | Event page, signed out | all | "Sign in to RSVP" and "RSVP" side by side read as the same thing twice | n: flow and copy decision |
| 19 | Event page, after RSVP (mock) | 1280 | A "Going" pill in the RSVP card and a "GOING" badge under the title | n: harmless; picking one is a design call |
| 20 | Masthead, signed in and not registered (mock) | 390 | "Register for the gathering" wraps to two lines in the pill | n: needs shorter copy |
| 21 | Masthead | 1024–1279 | The "About" link now hides below 1280 so the Spanish masthead fits (cost of fix 6; the foot still links About) | y, with that trade-off |
| 22 | Today (mock) | 1280 | "Later today: No events." followed by an "All events today →" card | n: copy; real days have events |
| 23 | About | all | "Join the Next Cycle" button during the live gathering | n: copy |
| 24 | Home: films and the ecosystem map | all | Blank dark and blank white boxes in my screenshots | n: could not judge; iframes did not paint in headless Chromium (unverified, not a confirmed bug) |
| 25 | Live load times | all | Every live page reached a heading in under 4 s; no page errors; no sideways scroll | n/a |

Script findings that are **not** faults (so nobody re-chases them): `button.aspect-square h-4 w-4` on Register (the
checkbox's own hit area), `section.homelive` / `.flow2` / `.o2` / `.board` "wider than box" by 20–22 px (the Your next
strip and trail bleed to the edge on purpose; the page never scrolls sideways), and `console: Failed to load
resource` on the live walk (my walker aborting the funnel POST beacons).

## Before / after

Files are in `walk/pairs/`.

| Fix | Before | After |
| --- | --- | --- |
| 1 Sign-in dialog, 1280 | `signin-dialog-1280-before.png` | `signin-dialog-1280-after.png` |
| 2 Sign-in card, 390 | `signin-card-390-before.png` | `signin-card-390-after.png` |
| 3 Ended event, 1280 | `event-past-1280-before.png` | `event-past-1280-after.png` |
| 4 Lone card, 1280 | `calendar-day-past-1280-before.png` | `calendar-day-past-1280-after.png` |
| 5 Uneven cards, 1280 | `calendar-day-1280-before.png` | `calendar-day-1280-after.png` |
| 6 Spanish masthead, 1024 | `calendar-day-1024-es-before.png` | `calendar-day-1024-es-after.png` |
| 8 Spanish tab bar, 390 | `tabbar-390-es-before.png` | `tabbar-390-es-after.png` |
| 10 Me | `me-1280-before.png` | `me-1280-after.png` |
| 12 Home prompt, 1280 | `home-signin-prompt-1280-before.png` | `home-signin-prompt-1280-after.png` |
| 13 Today, 1280 | `today-1280-before.png` | `today-1280-after.png` |
| 14 Board, 1280 | `board-1280-before.png` | `board-1280-after.png` |

(The 1024 and 390 Spanish "before" shots are live; the 1280 mock pairs use the same seeded data before and after.)

## What changed

- `src/components/AccountControl.tsx`, `src/components/ui/dialog.tsx`: the sign-in dialog mounts inside the app shell
  (`DialogContent container`) so it inherits the ecology fonts and colours; class `signin-dlg`.
- `src/styles/ecology.css`: dialog styling; shadcn tokens `--primary`, `--ring`, `--border`, `--muted-foreground`
  follow the palette inside `.alm.eco`; shadcn "community" buttons are forest pills; calendar list rows stretch and a
  lone last card spans the row; Today and Board desktop grids; Spanish masthead and tab-bar fit; Home prompt alignment.
- `src/pages/EventDetail.tsx`: ended events hide Share and Add to calendar (Subscribe stays); wrapped description
  lines rejoin (`src/lib/eventText.ts`, with `eventText.test.ts`).
- `src/pages/Companion.tsx`: "Turn off notifications" only shows when notifications are on (or were turned on here).
  Today gets `flow2--today`.
- `src/pages/Board.tsx`: `page--board` on the member view. `src/pages/Calendar.tsx`: Register CTA is a button.
- `scripts/walk-live.mjs`, `scripts/walk-mock.mjs`, `scripts/calendar-desktop-e2e.sh` (`WALKMOCK=1`): the two walkers.

New strings: **none**. Every label reused an existing EN/ES pair.

## Checks (run on this branch, last commit's tree)

| Check | Result |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.app.json`, no output, exit 0 |
| `npm test` | Test Files 66 passed, 1 skipped (67); Tests 910 passed, 1 skipped (911). Includes the new `eventText.test.ts` |
| `npm run lint` | 0 errors, 8 warnings (`react-refresh/only-export-components` in `ui/*` and `LanguageContext`; none in files I changed) |
| `npm run build` | `✓ built`, no errors |
| `E2E_PORT_OFFSET=2000 bash scripts/ci-e2e.sh` | `All hermetic e2e scripts passed.` (19 lane groups, including calendar-desktop-e2e, ecology-e2e, notify-e2e, board-e2e, people-e2e) |
| `scripts/walk-mock.mjs`, final run | 26 findings, all the non-faults listed above (Register checkbox hit area; 20 px bleed at 390). No page errors, no failed steps, no sideways scroll |
| `scripts/walk-live.mjs` on prod | 0 page errors, 0 loads over 4 s, 0 sideways scroll |

One e2e failure turned up and was fixed: `scripts/share-e2e.mjs` used an event dated 2026-10-15 as its "scheduled"
fixture. That date is now past, so the new rule (an ended event offers no Share or Add to calendar) made it time out.
It now uses an event a week ahead of the run and also asserts an ended event shows neither button (`PASS ended event`).

## Open

- Owner: an organizer. Delete the two **TEST** events on the public calendar (finding 16). I did not touch prod.
- Owner: Eileen / Aaron. Findings 17–20, 22, 23 are design or copy calls; I did not invent words.
- Unverified: finding 24 (films and map boxes look blank in headless screenshots). Worth one look in a real browser.
- Not covered: the real regenOS sign-in (the walker uses the mock's session cookie, and the mock sends no mail), push
  delivery, and the organizer `/admin` portal (needs a real organizer session; not walked).
- Screenshots in `walk/` are quantised to 192 colours to keep the repo small; they are for looking, not pixel diffs.
