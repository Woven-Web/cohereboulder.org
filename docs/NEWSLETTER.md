# Newsletters and the Beehiiv import

`/admin` → **Newsletter**. Any signed-in admin can write, test and send. Code:
`worker/src/newsletter.ts`; tables `newsletters` and `newsletter_sends`
(`worker/migrations/0005_newsletters.sql`).

## Two mail transports, kept apart

| What | Transport | From |
| --- | --- | --- |
| Sign-in codes, registration confirmations, RSVP mail | Cloudflare `send_email` binding (`sendMail` in `auth.ts`), unchanged | `MAIL_FROM`, `cohere@wovenweb.org` |
| Newsletters, their test sends, the admins' "about to send" notice | Resend HTTP API (`sendViaResend` in `newsletter.ts`) | `NEWSLETTER_FROM`, `hello@news.cohereboulder.org`; reply-to `NEWSLETTER_REPLY_TO`, `COhere@wovenweb.org` |

Cloudflare Email Service's FAQ calls it transactional-only, and complaints
from a blast must never throttle the transport organizers sign in with, so
newsletters never go through `sendMail`.

## Audience

Everyone subscribed, registrants of one form (`submissions.form_slug`, e.g.
`register-2026`, `register-2025`, `signup-2026`), or one tag (whole-tag,
case-insensitive match on the comma-separated `people.tags`). **Always**
`subscribed = 1` and never anyone tagged `undeliverable`. Tag a bounced
address `undeliverable` in the People tab and every audience drops it.

## Body

Plain text with light markdown: blank line = paragraph, `## heading`,
`- list item`, `**bold**`, `*italic*`, `[text](https://…)` (http/https/mailto
only), and an image on its own line as `![alt](https://…)` (https only).
Everything is escaped; no raw HTML passes through. The preview is a
sandboxed iframe showing the exact mail, in the site's mail shell, with the
unsubscribe footer.

## Safeguards (all enforced server-side)

1. **Test before send.** Send stays locked until the organizer test-sends
   this exact subject + body to their own admin address. The lock is
   `sha256(subject, body)`; any edit re-locks it. Another admin's test does
   not unlock it for you.
2. **Type the count.** The confirm step shows the live recipient count and
   the organizer must type that number.
3. **15-minute hold.** A confirmed send becomes `scheduled` for now + 15 min.
   Every admin gets an email with a cancel link
   (`/newsletter/cancel?token=…`): no sign-in, GET shows a button and only POST
   cancels, the token is stored hashed and never returned by the API. Any
   admin can also cancel from the tab. A cancelled newsletter can be reopened
   as a draft, which needs a fresh test.
4. **No double sends.** `newsletter_sends` has one row per
   (newsletter, person), `UNIQUE(newsletter_id, person_id)`: queued, then
   claimed, then sent / failed / skipped. Crashes and re-runs resume without
   resending, and each Resend call carries
   `Idempotency-Key: newsletter:<id>:<person_id>` to cover the gap between
   Resend accepting a message and the row being marked.
5. **Audit.** Each newsletter records `created_by`, `test_sent_to/at`,
   `confirmed_by/at`, `recipient_count_confirmed`, `cancelled_by/at`,
   `audience`, `sent_at`, and the per-recipient log.

Extra guards: the audience is snapshotted when the hold ends, so anyone who
unsubscribed during it is left out. Each recipient is re-checked right before
their message, so an unsubscribe mid-send wins. If the audience grew well past
the confirmed number during the hold (more than 10% and more than 10 people,
e.g. an import), the send cancels itself rather than mail people nobody
counted.

## Sending

`wrangler.jsonc` has two crons. `0 15 * * *` is the existing daily RSVP job.
`* * * * *` is the newsletter tick; `scheduled()` tells them apart by the cron
string. Each tick starts newsletters whose hold has passed and sends up to 40
messages, one `POST /emails` each, about 120 ms apart. Resend's default limit is
10 requests/second. A full tick is about 130 subrequests (40 Resend calls plus
roughly two D1 statements per recipient), well under the paid plan's 1,000 per
invocation, and about 5 s of wall time, mostly the spacing. That is about 2,400
messages an hour.

Per-recipient requests (not `/emails/batch`) are deliberate: each message
gets its own idempotency key and its own `List-Unsubscribe` header, and one bad
address fails alone. Transient errors (429, 5xx, network) retry on later
ticks, up to 5 attempts. A 429/503 ends the tick early. Other errors are
logged as `failed` on the row. Log lines carry newsletter ids, never
addresses.

Every message has the person's own unsubscribe link in the footer, plus
`List-Unsubscribe: <https://cohereboulder.org/unsubscribe?token=…>` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The existing
`/unsubscribe` POST is the RFC 8058 one-click target. It accepts any POST body,
including `List-Unsubscribe=One-Click`.

## Beehiiv import

Same tab. Upload Beehiiv's subscriber export CSV (`subscriber_id`, …,
`email`, `tags`, `status`, …, `unsubscribed_at`, …, `Name`). **Preview** shows
counts (new, already here, would unsubscribe, skipped invalid, duplicates)
and writes nothing. **Apply** then writes in pages of 200; the page loops
until done.

Merge is by lowercased email:

- New people: source `beehiiv`, tags `beehiiv` plus their Beehiiv tags, name
  from `Name`, a fresh `unsubscribe_token`. They are subscribed only if Beehiiv
  says `active` with no `unsubscribed_at`.
- Existing people gain those tags, and a name if theirs is blank.
- **Unsubscribe wins both ways.** Beehiiv `inactive` or an `unsubscribed_at`
  sets `subscribed = 0`, and nobody unsubscribed here is ever set back to 1
  (`MIN(subscribed, …)` in the UPDATE).
- Re-importing the same file changes nothing.

## Configuration

| Name | Kind | Default |
| --- | --- | --- |
| `RESEND_API_KEY` | Worker **secret** | unset. Test sends answer "isn't configured yet" and nothing goes out |
| `NEWSLETTER_FROM` | var | `COhere Boulder <hello@news.cohereboulder.org>` |
| `NEWSLETTER_REPLY_TO` | var | `COhere@wovenweb.org` |
| `RESEND_API_BASE` | var (tests only) | `https://api.resend.com` |

Set the key once: `npx wrangler secret put RESEND_API_KEY`, using a
sending-only key. Secrets persist across deploys. Alternatively, add it to
`deploy-worker.yml`'s wrangler-action `secrets:` list next to
`REGENOS_SERVICE_TOKEN`, with a repository secret of the same name.

## Testing locally

There is never a reason to use a real key. `scripts/resend-mock.mjs` stands in
for Resend (it honours `Idempotency-Key` and exposes `GET /_messages`), and
`RESEND_API_BASE` points the Worker at it. Lane 5 of `scripts/ci-e2e.sh` runs
`scripts/newsletter-e2e.mjs` that way. Unit tests: `worker/src/newsletter.test.ts`.
**Never point a test at api.resend.com**, and no real send without Aaron's go.
