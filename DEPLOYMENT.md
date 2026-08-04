# Deployment

Everything — the site, the API, the admin portal, the unsubscribe page — is one
Cloudflare Worker serving `cohereboulder.org`. There is a single deploy path.

```bash
export CLOUDFLARE_ACCOUNT_ID=8f2a7eb9d5e21ffa902a76cf62975c82
npm run deploy          # typechecks, builds the SPA, then deploys
```

One-time per machine: `npx wrangler login`.

`npm run deploy` publishes to `cohereboulder.org`, `www.cohereboulder.org`, and
`cohere-signup.unforced.workers.dev` (kept so a deploy can be checked before
looking at the real domain).

## Automatic deploys

`.github/workflows/deploy-worker.yml` deploys on every push to `main`, but only
once these repository secrets exist:

- `CLOUDFLARE_API_TOKEN` — Cloudflare → My Profile → API Tokens → "Edit
  Cloudflare Workers", scoped to the Unforced Development account
- `CLOUDFLARE_ACCOUNT_ID` — `8f2a7eb9d5e21ffa902a76cf62975c82`

**Until those are set the workflow skips**, and the only way to ship is
`npm run deploy` from a machine with wrangler logged in. Anyone with push
access can change the site, but their changes will not reach production.

The workflow typechecks, builds, deploys, then loads the live pages in headless
Chromium and fails if the app did not render.

---

# How the migration went (completed 2026-08-03)

Kept as a record of what moved and what to watch if it is ever revisited.

`cohereboulder.org` moved from GitHub Pages to this Worker, and its nameservers
from Bluehost to Cloudflare. What it bought: one origin for site and API, no
CORS, cookies that work for `/admin` on the real domain, deep links returning
200 instead of 404, `www` finally holding a valid certificate, and a single
deploy command.

Things worth remembering:

- **Cloudflare will not attach a Worker custom domain while other DNS records
  claim the hostname** (`code: 100117`), and the `override_existing_dns_record`
  flag does not cover externally-created records. The old GitHub Pages `A`
  records had to be removed first, from the dashboard.
- **Declaring `routes` silently disables the workers.dev URL** unless
  `"workers_dev": true` is also set. That took the API offline mid-migration.
- **`PUBLIC_BASE_URL` is where emailed sign-in links point.** Moving it to the
  real domain before the Worker served that domain produced links that 404ed.
  It belongs in the same change as the routes.
- Cloudflare proxied the old `mail` record on import and auto-created a
  `_dc-mx` placeholder to keep delivery working. Mail records should be
  DNS-only (grey cloud); proxying breaks IMAP, SMTP, and webmail.

## Email

`cohere@wovenweb.org` sends the admin sign-in mail through Cloudflare Email
Routing (wovenweb.org is a Cloudflare zone; its Google Workspace `MX` records
are untouched and must stay that way).

Cloudflare only delivers to addresses verified as Email Routing destinations,
which is fine for a handful of organizers but **cannot mail the member list**.
Sending to all 145+ members needs a real provider; `worker/src/auth.ts` already
has a Resend path behind `RESEND_API_KEY` for that day.

Now that `cohereboulder.org` has no mail of its own, Email Routing could be
enabled on it so sign-in mail comes from `cohere@cohereboulder.org` instead of
borrowing the Woven Web domain.
