# Report: simpler notification flow, and one-tap calendar subscribe

Branch `fix/simple-flows`, from `upstream/main` (d9d657f). Brief: `CLAUDE-TASK-simple-flows.md`.

## Status

**Completed.** Nothing was deployed or pushed, and no email or push was sent. Nothing was written to prod D1 or regenOS. No migrations.

## Summary

### 1. Notifications: one rule

What the code did before this change (checked in `notify-core.ts` `decide`/`isOn` and `notify-send.ts` `peopleFor`), and what it does now:

| Situation | Behaviour | Changed? |
| --- | --- | --- |
| Registered, no app | The 8 PM note by email, nothing to switch on | No, confirmed |
| Allows phone notifications (installed, granted, live) | Every note with no explicit choice goes to the phone. The 8 PM email stops. | Was already true by default, but had one gap (below). Now fixed. |
| Phone stops (404/410, or expires) | Notes fall back to email by themselves, still one per night | No, confirmed for registered-default people |
| Explicit choice | Always wins (e.g. Email chosen stays email with a live phone) | No, confirmed |

**The question in the brief:** does a registered person who installs the app get the 8 PM note twice? On a normal night, no. Exactly one push and no email. I found and fixed one gap:

- **The bug:** when the phone was linked, `mergeEmailPerson` returned early if the registration address had no saved settings. That is the usual case for registrants. So that night's "already sent" ledger rows stayed under `mailto:<address>`.
- **What it caused:** the 8 PM run spans several minute-ticks (40 emails per tick). If someone allowed notifications after their email went but before the run finished, the account looked unclaimed and got a push too. Two channels, same note, same night.
- **The fix:** the merge now always moves the ledger rows (`worker/src/notify-store.ts`).

**New on Me → Notifications:** once the phone has taken notes by default, one quiet line appears under "How we reach you": **"Now on your phone. Want email too?"** with an **Add email** link.
- One tap sets Phone + Email on every note that went to the phone by default, reminders included.
- The line disappears once any choice is made.
- It only shows when there is an address we may actually write to (verified or registered).
- No prompt and no chooser screen.

### 2. Subscribe to the calendar

- **New `GET/HEAD /calendar.ics`** (`worker/src/calendar-feed.ts`): the Worker reads the scenius feed anonymously.
  - It drops events titled exactly `TEST` and adds refresh hints (`X-PUBLISHED-TTL`, `REFRESH-INTERVAL`, one hour).
  - It re-folds lines at 75 octets and serves `text/calendar; charset=utf-8` with `Cache-Control: public, max-age=900` and a 15-minute edge cache.
  - If upstream fails it answers 502 with no-store, so calendar apps keep the copy they have.
- **`/api/events` and `/api/events/:did/:rkey`** now hand out `https://<host>/calendar.ics` instead of the scenius URL with raw colons.
- **The dialog** (`src/components/CalendarSubscribe.tsx`):
  - **Google Calendar** → `https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Fcohereboulder.org%2Fcalendar.ics` (one tap; Google asks "Add calendar?").
  - **Apple Calendar (iPhone, Mac)** → `webcal://cohereboulder.org/calendar.ics`.
  - The plain link stays as a fallback, with a Copy button.
  - The "copy this URL, then Other calendars → From URL" hint is gone.

### Strings (EN / ES)

| Where | English | Spanish |
| --- | --- | --- |
| Notifications line | Now on your phone. Want email too? | Ahora en tu teléfono. ¿También por correo? |
| …its link | Add email | Añadir correo |
| …after the tap (shown once saved) | Email added. These come by phone and email now. | Correo añadido. Ahora llegan por teléfono y por correo. |
| Subscribe: Apple button | Apple Calendar (iPhone, Mac) | Calendario de Apple (iPhone, Mac) |
| Subscribe: fallback label | Another calendar app? Copy this link into it. | ¿Otra app de calendario? Copia este enlace en ella. |
| Subscribe: copy button | Copy / Copied | Copiar / Copiado |
| Removed | "For Google Calendar, copy the URL below, then choose Other calendars → From URL…" | (and its Spanish) |

Unchanged: "Subscribe to calendar", its caption, and "Google Calendar". The Spanish has had no native-speaker pass, like the rest.

## Artifacts

| Commit | What |
| --- | --- |
| `3091947` | Notifications: ledger moves on merge (the double-send fix), "Want email too?" line, `notify-flow.test.ts` |
| `c547f89` | `/calendar.ics` proxy, one-tap Google/Apple links, mock feed, lane 4 assertions |
| `3a9f435` | e2e: "Want email too?" in lane 13, screenshot hooks (`SIMPLE_SHOTS_DIR`) |
| `c4f6b1f` | Review fixes: line folding, BOM tolerance, refresh hints always added, verified address only, toast waits for the save, Copy resets, rsvp-e2e never fetches the displayed URL |
| (report commit) | this report, `shots-simple/`, `/calendar.ics` in CLAUDE.md's architecture map, and a 500 ms animation wait before the lane 4 screenshots |

Screenshots in `shots-simple/`:
- `email-too-390.png`, `email-too-1280.png`: settings with the new line, phone live, no choices.
- `email-too-added-390.png`: after the tap. Every row has Phone and Email pressed, and the line is gone.
- `subscribe-390.png`, `subscribe-1280.png`: the dialog. The address reads `http://cohereboulder.org/…` because wrangler dev rewrites the request host to the production route. In production it reads `https://cohereboulder.org/calendar.ics`.

## Checks

- `npm run typecheck` → exit 0.
- `npm test` → `Test Files 69 passed | 1 skipped (70)`, `Tests 983 passed | 1 skipped (984)`.
- `npm run lint` → `✖ 8 problems (0 errors, 8 warnings)`. All 8 are the old react-refresh warnings in `src/components/ui/*` and `LanguageContext.tsx`. One run during e2e also showed an error inside `.wrangler/tmp/` (wrangler dev's temporary bundle); the run afterwards was clean.
- `npm run build` → built. `wrangler deploy --dry-run` bundles the Worker.
- **`E2E_PORT_OFFSET=3000 bash scripts/ci-e2e.sh` → `EXIT 0`, all 20 lanes**, run with `SIMPLE_SHOTS_DIR` set. New passing lines:
  - `ok  calendar subscription: one-tap Google and Apple links to our own feed, which drops TEST events`
  - `ok    live phone, no choices made: 'Now on your phone. Want email too?'`
  - `ok    'Add email': morning|reminder|harvest|evening now goes by phone and email`
  - `ok    the line goes once the choice is made`
- **New unit tests:**
  - `worker/src/notify-flow.test.ts` (6): drives the real `/api/companion/subscriptions`, `/api/notify/heartbeat`, `/api/notify/device` and `/api/notify/settings` routes and `runNotifyCron`. It covers:
    - registered → one email;
    - phone allowed → exactly one push and no email, ledger shows one channel per night;
    - mid-run linking → no push;
    - "Add email" → both;
    - 410 → email fallback, once per night;
    - email chosen → email only.
  - `worker/src/calendar-feed.test.ts` (11): TEST filter, folded and parameterised SUMMARY, re-folding at 75 octets, BOM and trailing spaces, refresh hints, non-calendar refused; proxy URL with raw colons, headers, 15-minute cache hit, HEAD, 502 not cached, 404 when unconfigured.
  - `src/lib/calendarLinks.test.ts` (+2): exact Google/Apple link format, no raw `:` or `/` in the query.
  - `src/lib/notifyStatus.test.ts` (+3): when the line shows, and what the tap writes.
- **Proved the tests can fail:** I broke each piece, watched it go red, then restored it:
  - the TEST filter → 3 red;
  - the content type → 2 red;
  - the 502 path → 1 red;
  - `encodeURIComponent` in the Google link → 2 red;
  - the `chosen === null` check → 2 red;
  - the ledger move in `mergeEmailPerson` → 2 red (the mid-run test also failed before the fix);
  - folding → 1 red.
- **One read-only GET of the live scenius feed:** 200, `text/calendar; charset=utf-8`, CRLF, no folded lines, 50 events, 2 titled exactly `TEST`.
- **Local wrangler dev against the mock:** `curl /calendar.ics` → 200 with the headers above, TEST dropped, hints present.
- **Code review** (`/code-review`, medium): 9 findings. I fixed 6, in `c4f6b1f`. Not taken:
  - **Case-insensitive "test":** the brief says exactly "TEST", and a title like "Test kitchen" could be real.
  - **Purging `/calendar.ics` after event writes:** scenius's own CloudFront copy is 5 minutes old at most, so purging ours doesn't shorten the worst case, and calendar apps poll every few hours anyway.
  - **`ctx.waitUntil` for the cache write:** `events.ts` uses the same awaited pattern.
- **Not run:** a `/verify` skill. There is none in this environment, so the e2e lanes and local wrangler dev runs above stand in for it.

## Open

- **Unplanned production read:** the first full e2e run made one read-only GET to `http://cohereboulder.org/calendar.ics`. Lane 4 fetched the address the page displayed, and wrangler dev rewrites that host to the production route. It got the SPA HTML back; nothing was written. The test now fetches only the local Worker and checks the displayed URL for shape only.
- **Google side unverified.** Google must fetch the feed from the public URL, so I could not test locally that it accepts it. I checked that plain `http://cohereboulder.org/…` reaches the Worker with no redirect, so a `webcal://` fetch will reach it. **After deploy (Aaron's go-ahead needed):**
  - `curl -I https://cohereboulder.org/calendar.ics` should say `text/calendar`. Today it returns the SPA HTML with `CF-Cache-Status: HIT`, so confirm the edge isn't still serving that.
  - Then tap Google Calendar on a phone once.
- **Remaining double-send case we can't detect:** a registered person whose regenOS account has a different verified address, or none, than the one they registered with. The site cannot tell those are the same person, so they get a push on the account and the default email on the registration address. They can turn either off. Turning the default email off for all app users would need a product decision.
- **"Add email" includes event reminders**, so that "email too" means all of it. If that is too much mail, drop `reminder` in `addEmailPatch` (`src/lib/notify.ts`).
- **Not covered by the full-suite run:** the 500 ms wait added before the lane 4 screenshots runs only when `SIMPLE_SHOTS_DIR` is set, and was added after the final run.
- **Next:** organizer/Uni review on staging (`npm run deploy:staging` from this branch), then merge.
