# COhere Boulder 🌱

The website and member database for COhere Boulder — a ten-day community
container weaving Boulder's regenerative ecosystem.

**COhere Boulder 2026: October 15–25.** Live at
[cohereboulder.org](https://cohereboulder.org).

## Getting started on a new machine

```bash
git clone https://github.com/Woven-Web/cohereboulder.org.git
cd cohereboulder.org
npm install
npm run dev              # http://localhost:8080
```

That's it — no `.env` is required. The site talks to the deployed Cloudflare
Worker for forms. Copy `.env.example` to `.env` only if you want to point at a
local Worker instead.

To deploy or touch the database, you also need Cloudflare access:

```bash
npx wrangler login
export CLOUDFLARE_ACCOUNT_ID=8f2a7eb9d5e21ffa902a76cf62975c82
```

## How it fits together

A React SPA plus **one Cloudflare Worker** that serves the built site, the
public form API, the unsubscribe page, and the admin portal. Member data lives
in Cloudflare D1. There is no other backend.

```
src/                     the React site
  components/            DynamicForm renders whatever the API defines
  lib/api.ts             the only place that talks to the Worker
  lib/translations.ts    every user-facing string, EN + ES
  assets/photos/         stills from the Woven Web films
worker/
  src/index.ts           routing: assets, forms, admin API, unsubscribe
  src/auth.ts            magic link + one-time code sign-in
  src/admin-page.ts      the admin portal, one self-contained HTML page
  schema.sql             people / forms / submissions / admins
wrangler.jsonc           deploys the Worker AND the site together
supabase/                archive of the retired 2025 stack — not deployed
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :8080 |
| `npm run worker:dev` | Run the Worker locally with wrangler |
| `npm run build` | Build the SPA into `dist/` |
| `npm run deploy` | Build, then deploy Worker + site to Cloudflare |
| `npm run lint` | ESLint |
| `npm run typecheck` | Type check (CI runs this too) |

## The admin portal

**https://cohereboulder.org/admin**

Organizers sign in with their email — a magic link and a one-time code, no
password and no shared key. Aaron, Benya, and Eileen are set up; add others
from the portal's "Who can sign in" tab.

From there you can search everyone who has ever registered, filter by year or
by who offered to host, read each person's answers, add organizer tags and
notes, export CSV — and **edit the questions on any form without a deploy**.

## Changing a form

The questions live in the database, not in the code. Edit them in the portal's
Forms tab (or `PUT /api/admin/forms/:slug`) and the site picks them up on the
next page load. `worker/README.md` documents the field definition format.

## Who can deploy what

| Change | Needs | Ships via |
| --- | --- | --- |
| Anything in the site or the Worker | GitHub push access **once `CLOUDFLARE_API_TOKEN` is set**; otherwise Cloudflare account access | push to `main` → `deploy-worker.yml`, or `npm run deploy` locally |
| Form questions, member records | Admin portal sign-in only | the portal — no repo involved |

## Documentation

- `CLAUDE.md` — architecture, conventions, and the design system
- `DEPLOYMENT.md` — how to deploy, plus the DNS migration runbook
- `worker/README.md` — the API surface, data model, and admin access
