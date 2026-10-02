# Door check-in

Organizers sign in at `/admin`, then follow **Door check-in** (or open
`/admin/checkin`). Volunteers need their own address in the existing admins
list; there is no new shared door password.

## At the door

- Pick an event. The initial choice favors events happening now or today in
  **America/Denver**; a selection in this tab is remembered.
- Search name/email and tap **Check in**; **Undo** deletes the arrival row.
- Expected people merge email RSVPs and regenOS confirmed guests. Only confirmed
  guests are available, not requests/waitlists. regenOS guests carry a DID and
  sometimes a handle, not an email. We cannot identify someone who RSVP'd both
  ways as one person; ask which RSVP they used rather than checking both in.
- Search also finds up to 20 `register-2026` registrants (2+ characters).
- Walk-ins can provide a name and optional email. Checking in does not send mail.
  The email-list checkbox is optional, requires an email, and is never prechecked.
  Only ticking it creates a mailing-list person. Existing unsubscribed people
  remain unsubscribed; existing names, sources and unsubscribe tokens are kept
  (a blank name may be filled).
- Export downloads only the selected event's arrivals, including source, time and
  organizer. Spreadsheet formula prefixes are defused. Treat exports as private.

## Venue wifi and privacy

Taps show immediately and pending operations persist in this phone/browser's
localStorage until synced. The header says how many are **waiting to sync**.
Do not treat a pending tap as proof the server saved it. Retries use stable IDs;
email and regenOS DID uniqueness prevent duplicates between door phones.
Undo of an attempted tap queues a delete after its retry. An undo queued while
another phone wins the check-in race is remapped to the server's stored row ID.
The visible roster refreshes every 20 seconds when idle.

Keep the page open: the loaded roster survives a network interruption in memory,
but there is no offline service worker or persistent roster cache. Reloading
without a connection cannot load the calendar/roster. Registrant search and CSV
export require connectivity. If regenOS attendance fails, an explicit warning
appears; D1 email RSVPs and walk-ins continue to work. Event name/start snapshots
allow writes to continue without a successful upstream read.

Use trusted devices. The full roster is never persisted locally, but pending
operations contain names/emails and remain in localStorage across a reload or
expired session until an organizer signs in and they sync. This is not a shared
public kiosk. Before handing a phone to someone else, let the queue empty and
clear browser site data. API responses and CSV exports are `no-store`; the
static page contains no member data, and every data route requires the existing
admin session. Names, emails, handles and event labels are escaped in HTML.

## Data and retention

`event_checkins` stores arrival ID, event DID/rkey, name/start snapshots, optional
email and guest DID, name, source, optional person ID, organizer email and time.
Partial unique indexes cover event/email and event/guest DID; email-less walk-ins
are distinct arrivals with client-generated IDs. No check-in email is sent.
The existing daily cron deletes arrivals whose snapshot event start is older
than 30 days. Undated events use their first check-in time as the retention
anchor. Mailing-list people are not deleted by this job. Undo deletes only the
arrival, not an opted-in mailing-list person. If an event is rescheduled after
we have stored its snapshot, retention uses that original snapshot.

## Rollout (not performed by this PR)

Apply `worker/migrations/0006_event_checkins.sql` **before deploying the Worker**.
The number deliberately leaves `0005_newsletters.sql` for unmerged newsletter
PR #35. Coordinate ordering with that PR: apply 0005 then 0006 if both ship;
0006 itself has no newsletter-table dependency. Do not rename either migration
into a collision. `worker/schema.sql` includes the table for fresh local setups.
No new secret, binding or cron schedule is required. Existing regenOS attendance
integration is reused unchanged (including its anonymous read behavior; do not
add a bearer to reads). Host-roster availability against production was not
verified; the page explicitly degrades if it is unavailable.

## Verification

```sh
npm run typecheck
npm run lint
npx vitest --run
npm run build
bash scripts/ci-e2e.sh
```

`worker/src/checkins.test.ts` covers merged-list dedupe, Boulder-date selection,
validation, idempotency, undo, opt-in/unsubscribe rules, upstream failure,
registrant search, CSV formula safety and retention. `scripts/checkin-e2e.mjs`
is lane 5 of the hermetic suite: real Chromium at 390×844, seeded admin session,
mock regenOS, email RSVP check-in/undo, regenOS guest, registrant search,
walk-ins/opt-in, XSS, CSV, anonymous 401, offline retry and offline undo.
All data is invented and all writes are local; no production D1 or real mail.
