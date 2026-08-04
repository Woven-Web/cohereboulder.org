# cohere-signup Worker

The member database and admin portal for cohereboulder.org. No Supabase involved —
people and their form answers live in Cloudflare D1, and the "stay in the loop"
signups are also mirrored into KV.

- **Live:** `https://cohereboulder.org` — the Worker serves the site too
- **Admin portal:** `https://cohereboulder.org/admin`
- **D1 database:** `cohere` (`9eaac080-fe20-4124-8719-452091797866`)
- **KV namespace:** `SIGNUPS` (`e7cb04113ed14308bff4b85dbbe35ac7`) — legacy signup mirror
- The frontend (`src/components/EmailSignup.tsx`) posts here; override with
  `VITE_SIGNUP_URL` if the endpoint ever moves.

## Data model

Three tables (`schema.sql`), designed so a form can change without a deploy:

| Table | Holds |
| --- | --- |
| `people` | Identity that persists across years — email (unique), name, phone, orgs, subscribe state, tags, internal notes |
| `forms` | The questions themselves, as a JSON array of field definitions |
| `submissions` | One row per person per form; answers stored as a JSON object |

Adding or rewording a question in 2026 means editing a row in `forms` — from the
admin portal's Forms tab — not writing a migration.

A field definition looks like:

```json
{ "key": "co_creating_interests",
  "label": "Co-creating COhere",
  "help": "Optional helper text shown under the label",
  "type": "checkboxes",
  "options": ["Host an event", "Volunteer", "Tell stories"] }
```

`type` is one of `text`, `textarea`, `email`, `tel`, `radio`, `checkboxes`.

## API

```
POST /                       {"email": "...", "name?": "...", "source?": "hero|footer|..."}
                             → {"ok": true}   Legacy signup shape; writes D1 + KV.

POST /api/submit/:formSlug   {"email": "...", "name?", "phone?", "orgs?",
                              "answers": { ...keyed by field key... }}
                             → {"ok": true}   404 unknown form, 410 if the form is closed.

  Both public routes are CORS-restricted to cohereboulder.org (+ localhost:8080)
  and accept a hidden "website" honeypot field.

GET  /admin                                     Portal UI
GET  /api/admin/people        session cookie → everyone, with submissions attached
GET  /api/admin/forms         session cookie → form definitions + response counts
GET  /api/admin/admins        session cookie → who can sign in
POST /api/admin/admins        session cookie   add an admin
PUT  /api/admin/forms/:slug   session cookie   replace a form's questions, and its
                                               confirmation email copy
PUT  /api/admin/people/:id    session cookie   set tags, internal notes, subscribe state
GET  /api/admin/export.csv?form=<slug>            flat CSV, one column per question
GET  /list                    session cookie → raw KV signups (legacy)
```

## Admin access

Organizers sign in with their email — no password, no account to create. A
request mints one challenge good for both a magic link and a typed 6-digit
code, valid ten minutes. Sessions are opaque tokens in an HttpOnly cookie,
good for 30 days, revoked on sign-out or when an address leaves `admins`.

Only addresses in the `admins` table can sign in; manage them from the portal's
"Who can sign in" tab. Requests for other addresses return the same response as
real ones, so the portal can't be used to test who is an organizer.

```
POST /api/auth/request   {"email": "..."}          → emails a link and a code
POST /api/auth/verify    {"email":"...","code":"123456"} → sets the session cookie
GET  /api/auth/callback?token=...                  → magic link, single use
GET  /api/auth/me                                  → who am I
POST /api/auth/logout                              → ends the session
```

### Email delivery

`sendMail` takes whichever transport is configured:

1. **Resend** — set `RESEND_API_KEY` and it wins. Sends to anyone, which is
   what member-facing email will need later.
2. **Cloudflare `send_email` binding** — needs the zone on Cloudflare DNS, and
   only delivers to addresses verified in Email Routing. Fine for a handful of
   organizers, useless for the wider community.

```bash
npx wrangler secret put RESEND_API_KEY
```

### If you are ever locked out

There is no shared password — an emailed session is the only way in. If mail
delivery breaks, add or confirm an address directly:

```bash
npx wrangler d1 execute cohere --remote \
  --command "INSERT OR IGNORE INTO admins (email,name,added_by,created_at) \
             VALUES ('you@example.com','You','manual','2026-01-01T00:00:00Z')"
```

That still needs Cloudflare account access, which is the intended backstop.

## Exporting

Use the **Export CSV** buttons in the portal — the session cookie authenticates
them, so no token juggling is required.

## Seeding from the 2025 Supabase export

One-shot, already run. `seed-from-supabase.py` reads `exports/*.json` (the full
Supabase dump) and writes `seed.sql` — both are gitignored because they contain
names, emails, and phone numbers.

```bash
cd worker && python3 seed-from-supabase.py
npx wrangler d1 execute cohere --remote --file=worker/seed.sql
```

## Deploying

From the repo root (the wrangler config lives there and builds the site too):

```bash
export CLOUDFLARE_ACCOUNT_ID=8f2a7eb9d5e21ffa902a76cf62975c82
npm run deploy
```
