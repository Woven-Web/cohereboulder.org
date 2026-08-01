# Deployment

Two things ship, and right now they ship to two different places.

| What | Where it runs today | How to deploy |
| --- | --- | --- |
| The Worker: API, admin portal, unsubscribe, **and a full copy of the site** | `cohere-signup.unforced.workers.dev` | `npm run deploy` |
| The public site | `cohereboulder.org` (GitHub Pages) | push to `main` |

Both are live and both work. The Worker copy is the destination architecture —
site and API on one origin — waiting only on DNS.

## Deploying the Worker

```bash
export CLOUDFLARE_ACCOUNT_ID=8f2a7eb9d5e21ffa902a76cf62975c82
npm run deploy          # builds the SPA into dist/, then deploys everything
```

One-time per machine: `npx wrangler login`.

## Deploying the site (current)

Push to `main`. `.github/workflows/deploy.yml` builds and publishes to GitHub
Pages. No secrets are required — the Supabase and Google Maps keys it used to
need are gone.

---

# Migrating cohereboulder.org to Cloudflare

The payoff: one origin for site and API. No CORS, cookies work for `/admin` on
the real domain, deep links stop returning HTTP 404, and one command deploys
everything.

The cost: **the nameservers move from Bluehost to Cloudflare, which moves all
DNS including mail.** Do it deliberately.

## Current DNS inventory

Captured 2026-08-01 by direct lookup. **Re-verify before migrating** — export
the full zone file from Bluehost rather than trusting this table.

| Record | Value | Purpose |
| --- | --- | --- |
| `NS` | `ns1.bluehost.com`, `ns2.bluehost.com` | current authority |
| `A` (apex) | `185.199.108.153`, `.109.153`, `.110.153`, `.111.153` | GitHub Pages |
| `www` | same GitHub Pages IPs | GitHub Pages |
| `MX` | `0 mail.cohereboulder.org` | **email — do not break** |
| `mail` | `50.6.153.0` | Bluehost mail host |
| `TXT` | `v=spf1 ip4:50.6.152.221 a mx include:websitewelcome.com ~all` | SPF |
| `TXT` | `google-site-verification=sitEfb9HOkNdK4OcMo14hbPMI5eP0sXcyFFBIlO5FiY` | Search Console |

There may be DKIM, `_dmarc`, or other subdomain records not visible from
outside. The Bluehost zone export is the source of truth.

## Runbook

1. **Export the zone from Bluehost.** Every record, not just the ones above.
2. **Add `cohereboulder.org` to Cloudflare** (Websites → Add a site). Cloudflare
   scans and imports what it can find; it will miss anything not publicly
   resolvable.
3. **Reconcile.** Compare the imported records against the Bluehost export line
   by line. Pay closest attention to `MX`, `mail`, SPF, and any DKIM records.
   Set `mail` to **DNS-only** (grey cloud) — proxying breaks mail delivery.
4. **Do not change the nameservers yet.** Verify the Cloudflare zone is complete
   first. This step is reversible; the next one is disruptive.
5. **Update the nameservers at Bluehost** to the pair Cloudflare provides.
   Propagation is usually under an hour but allow 24.
6. **Confirm mail still flows** — send a message to an address at the domain and
   confirm receipt. Do this before touching the website records.
7. **Point the site at the Worker.** In Cloudflare: Workers & Pages →
   `cohere-signup` → Domains & Routes → add `cohereboulder.org` and
   `www.cohereboulder.org`. This replaces the GitHub Pages `A` records.
8. **Switch the frontend to same-origin.** In `src/lib/api.ts` the API base
   defaults to the absolute workers.dev URL. Once the site is served by the
   Worker, build with `VITE_SIGNUP_URL=""` so requests become relative. Also set
   `PUBLIC_BASE_URL` in `wrangler.jsonc` to `https://cohereboulder.org` so
   sign-in links point at the real domain.
9. **Retire the GitHub Pages workflow** once the Worker is serving the domain —
   delete `.github/workflows/deploy.yml` and `public/CNAME`, so there is only
   one way to deploy.

## Rollback

Before step 5, nothing has changed for visitors. After step 5, rolling back
means pointing the nameservers back at Bluehost. After step 7, rolling back
means removing the Worker route and restoring the GitHub Pages `A` records.
Keep the Pages deployment working until you are confident.

## Email

`cohere@wovenweb.org` sends the admin sign-in mail through Cloudflare Email
Routing (wovenweb.org is already a Cloudflare zone; its Google Workspace `MX`
records are untouched and must stay that way).

Cloudflare only delivers to addresses verified as Email Routing destinations,
which is fine for a handful of organizers but **cannot mail the member list**.
Sending to all 145+ members needs a real provider; `worker/src/auth.ts` already
has a Resend path behind `RESEND_API_KEY` for that day.
