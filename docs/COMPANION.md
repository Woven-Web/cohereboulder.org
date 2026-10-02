# COhere Boulder daily companion

This feature is implemented in the SPA and the existing Worker. `/today` shows
practice, question, and public events today/tomorrow; `/quests` is a local
checklist with anonymous completion reports; `/more` contains installation,
notification preferences, language switching and privacy information. The
manifest starts at `/today` in standalone mode. Mobile standalone windows get
Today / Calendar / Quests / More navigation, safe-area padding and suppressed
overscroll. Desktop navigation is unchanged.

## Local verification and schema

Migration **0008_companion.sql** intentionally leaves 0006 and 0007 reserved
for PR36 and PR37. `worker/schema.sql` includes the same tables and indexes.
There is no seeded gathering content, subscription, operational private key or member data.
The RFC8291 unit test contains only the published reference-vector private scalar;
all VAPID/mock delivery keys are generated at runtime and never stored in source.
Do not run schema.sql against an existing production database; apply the incremental migration through the established release process.

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
E2E_PORT_OFFSET=1000 bash scripts/ci-e2e.sh
```

The full runner uses a unique `$TMPDIR/pwa-e2e-*` directory and local D1/KV.
All log filenames start with `pwa-`. `E2E_PORT_OFFSET` shifts the existing
calendar/email lanes; the companion lane defaults to Worker 8898, calendar
mock 10048, push mock 10049, inspector 19298. Override `PWA_WORKER_PORT`,
`PWA_MOCK_PORT`, `PWA_PUSH_PORT`, `PWA_INSPECTOR_PORT` if those ports are in use.
Every server runs in its own process group, killed on exit. The push receiver
creates fresh P-256 keys in a mode-0600 scratch file, independently verifies
VAPID and decrypts the encrypted message using Node crypto. The private-key
file is removed on exit. No real push or email service is contacted. Browser
checks cover mobile Today/replies/quests, install events, iOS guidance, denied
permission, standalone navigation, desktop visibility, admin content/replies,
and the offline shell. A secure origin or loopback and installed Playwright
Chromium are required. A sandbox that prohibits loopback sockets cannot run
this gate; unit crypto tests additionally exercise the receiver in-process.

## VAPID configuration (instructions only)

Set all three Worker values to enable push:

| Value | Format |
| --- | --- |
| `VAPID_PUBLIC_KEY` | base64url uncompressed P-256 public point (65 bytes) |
| `VAPID_PRIVATE_KEY` | base64url P-256 private scalar (32 bytes); Worker secret |
| `VAPID_SUBJECT` | organizer contact URI: `mailto:` or `https:` |

If any value is absent, the public API returns `pushKey: null`, settings explain
that delivery is disabled, and subscription creation returns 503. Other APIs
and retention remain available. Keep the signing key stable: rotating it means
users must opt out and subscribe again. Never put a private key in source,
wrangler vars, a ticket, a PR, screenshots or an exported dataset.

Generate a new key pair **in a secure operator environment**, outside this repo.
The following writes only to a path you supply; it is not run by this feature:

```bash
node --input-type=module - "$TMPDIR/pwa-vapid.json" <<'JS'
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const publicKey = Buffer.concat([
  Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url'),
]).toString('base64url');
writeFileSync(process.argv[2], JSON.stringify({ publicKey, privateKey: jwk.d }), { mode: 0o600 });
JS
```

Configure production values through the normal secret handling
process. This implementation does not configure secrets or deploy anything.
`COMPANION_LOCAL_PUSH_MOCK` is **only** for hermetic local tests; it must be an
exact `http://127.0.0.1:<port>` origin. Never set it in production. Without this
explicit configuration, only public HTTPS FCM, Mozilla, Apple, and Windows push
service hosts are accepted. Arbitrary domains, credentials, private addresses,
nonstandard ports, fragments and redirects are refused. Key points are checked
by WebCrypto when subscriptions are accepted and revalidated before sending.

## Schedule and delivery semantics

`COMPANION_START_DATE` and `COMPANION_END_DATE` are inclusive ISO dates, default
**2026-10-15..2026-10-25**. Configure valid `YYYY-MM-DD` dates with start on or before end. Invalid dates
stop companion work; companion failures are isolated from newsletter and RSVP jobs. Daily slots are:

| UTC cron | During Boulder MDT | Content |
| --- | --- | --- |
| `0 12 * * *` | 6 AM | practice title/body |
| `0 15 * * *` | 9 AM | public events today and tomorrow |
| `0 21 * * *` | 3 PM | daily question |

Dates use `America/Denver`; UTC triggers remain fixed if a future gathering is
scheduled during standard time. Existing 15:00 RSVP reminders and the minute
newsletter cron are preserved. The minute cron also continues already claimed
companion slots for up to five minutes, without creating late content.
Missing practice/question/events skips that slot. Events come through the
existing **anonymous, read-only** calendar reader; cancelled events are omitted.
The existing Worker event preview code already emits escaped public OG metadata.
There is no attendee or reply information in event previews or push payloads.

The durable ledger has unique `(date, slot, recipient)` keys. A `*` recipient
stores the slot's English/Spanish payload snapshot and cutoff timestamp. Each
actual device is claimed atomically **before** push network I/O. Overlapping
invocations cannot send twice to a recipient. Registered-after-slot devices
are excluded, and edits do not change an in-progress slot's payload. Queries
are pages of 50, at most 20 pages per invocation, with a deadline check before
each delivery. A following minute tick can continue unclaimed devices. This
bounds memory and work without fetching the entire subscription table.

**At-most-once tradeoff:** a crash after a device claim, a timeout, or a rejected
send loses that notification. Claimed recipients never retry, even if the
service might not have received the request. Unclaimed recipients can continue
within five minutes; after that they are skipped to avoid stale reminders.
Very large/slow cohorts may exceed this window. TTL is 300 seconds. A push
service accepting a request does not prove the device displayed it. A 404/410
removes the matching endpoint and keys; replacements are protected from stale
delivery results. Other failures increment `failure_count`, and success
records `last_success` and resets the counter. No delivery failure is logged
with an endpoint, key, reply or private identity.

## Editable content and admin use

Sign in through the existing `/admin` session flow, then choose **Companion**.
Select an existing row to edit its JSON, or select New. Save uses the same
session gate and requires an exact same-origin Origin for every mutation.
Delete requires the portal's normal explicit confirmation.

Daily content:

```json
{
  "type": "daily", "date": "2026-10-15", "title": "",
  "body": "", "title_es": "", "body_es": "",
  "question": "", "question_es": ""
}
```

Quest content:

```json
{
  "type": "quest", "id": "organizer-chosen-id", "title": "",
  "description": "", "title_es": "", "description_es": "",
  "start_date": "2026-10-15", "end_date": "2026-10-25"
}
```

A nonempty title is required; examples intentionally contain no real content.
Titles are limited to 200 characters, body/description to 3000, questions to
1000. Spanish fields fall back to English when empty. Quest windows must be
valid and ordered. Replies and totals are read-only organizer views. Reply
viewer and CSV export use pages of 100; the CSV link exports the current page.
Content and totals lists are capped at 100 rows (enough for this gathering);
API editing by date/id remains available for other rows. Text is rendered with
React escaping or the portal's HTML escape helper. CSV cells are quoted and
formula-leading `=`, `+`, `-`, `@`, including leading whitespace, are prefixed
with an apostrophe. Reply names are optional and limited to 80 characters;
reply text is limited to 2000, one per device per Denver day.

## Installation, notifications, privacy and offline behavior

Chromium/Android preserves `beforeinstallprompt`; only the Install button
invokes its prompt. iOS/iPadOS shows illustrated Share → Add to Home Screen →
open-from-Home-Screen instructions. Home Screen Web Push requires 16.4+.
Permission is requested only from the Enable notifications button. Denied
permission explains how to change device/browser settings; unsupported and
unconfigured delivery have separate messages. Turning off notifications
removes the server subscription, then unsubscribes the browser; if offline,
settings retain a retry action rather than claiming successful opt-out. Existing
browser subscriptions prove ownership with endpoint, auth and p256dh keys, so
opt-out still removes the server row after device UUID storage is lost. Language
changes update that subscription with the same proof; failed updates are visible.
Today refreshes at Denver midnight and clears the previous day’s reply state.

No account, email, phone or name is required. A random UUID identifies the
browser device, without linking it to people/admins/RSVP tables. Replies can
optionally include a name; organizers should discourage sensitive content.
Quest checks remain on the device, and completion reports have a unique
device/quest pair. Unchecking does not retract a historical completion report.
Repeated reports are idempotent; failed reports can be retried. If storage is
unavailable, device identity/checks work within the session but do not survive
closing it. YAY's scale animation runs only when reduced motion is not requested.

Hourly D1 abuse counters limit replies to 20, subscriptions to 30 and completion
reports to 100 per network bucket. Buckets hash hour + network address; raw IP
addresses are never written to companion tables. Old buckets are purged after
24 hours. After end + 30 days (default: beginning November 25), cron purges
anonymous replies, completions, subscriptions and delivery ledger in bounded
500-row batches, **including when VAPID is unset**. The minute cron continues
these batches until empty. Authored content remains for organizer reuse.
Local UUID/checklist data is independent browser storage; clearing site data
removes it. No reply text is retained locally.

The SW precaches the public `/today` HTML and its built JS/CSS plus manifest and
brand-derived icons. It never intercepts API, admin, auth, unsubscribe, xrpc,
foreign-origin, query-bearing or non-GET requests. Offline navigation to Today,
Calendar, Quests and More uses the public shell; content requires a connection.
Notification clicks allow only known local companion/calendar/event routes,
otherwise fall back to `/today`. The build fingerprints the shell into the SW cache name, so updated app
assets trigger installation of a fresh offline shell automatically. Asset requests do not write new dynamic cache entries.

## Rollout instructions

Review this branch and all verification output; run the full hermetic runner in
an environment with loopback sockets and Playwright support. Apply migration
0008 through the established migration process, configure VAPID securely,
review organizer-authored English/Spanish content and configured date window,
and check an actual installed iPhone and Android device before announcing
`/today`. Follow the established release process for deployment and migrations.

## Official technical references

- [RFC8291, encryption example and Appendix A vector](https://www.rfc-editor.org/rfc/rfc8291.txt)
  — fetched directly from RFC Editor and verified byte-for-byte in Vitest.
- [RFC8292, ES256 VAPID audience/expiry/signature](https://www.rfc-editor.org/rfc/rfc8292.txt).
- [W3C Push API](https://www.w3.org/TR/push-api/).
- [W3C Web Application Manifest](https://www.w3.org/TR/appmanifest/).
- [WebKit: Web Push for Home Screen apps on iOS/iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
- [Chrome: deferred install prompts and user gestures](https://developer.chrome.com/blog/a2hs-updates/).
- [Cloudflare: Cron Triggers and UTC schedules](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

