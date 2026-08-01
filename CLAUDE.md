# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

The website and member database for **COhere Boulder** — a ten-day community
container in Boulder, Colorado. **COhere Boulder 2026 runs October 15–25.**

The immediate goal is simple: let people **find the site, register their
interest, and get on the list**, and let the three organizers read and manage
who has signed up.

## Architecture in one paragraph

A React SPA and a single Cloudflare Worker. The Worker serves the built site as
static assets, exposes the public form API, renders the unsubscribe page, and
hosts the admin portal at `/admin`. Member data lives in Cloudflare D1. **There
is no other backend.** Supabase was the 2025 stack and has been fully removed
from the frontend — see "History" below.

```
Browser ─→ Worker (cohere-signup)
             ├── /                 → static assets (dist/, SPA fallback)
             ├── /api/form/:slug   → a form's questions (public)
             ├── /api/submit/:slug → a form submission (public)
             ├── /  (POST)         → legacy email-only capture
             ├── /unsubscribe      → opt-out page
             ├── /api/auth/*       → magic link + one-time code sign-in
             ├── /api/admin/*      → admin JSON, session cookie or bearer key
             └── /admin            → the admin portal (self-contained HTML)
                    ↓
              D1 `cohere` + KV (COHERE_AUTH sessions, SIGNUPS legacy mirror)
```

## Commands

```bash
npm install
npm run dev          # Vite dev server on :8080 (site only)
npm run worker:dev   # wrangler dev — the Worker plus the built site
npm run build        # build the SPA into dist/
npm run deploy       # build, then deploy the Worker AND the site together
npm run lint
npx tsc --noEmit     # type check
```

`npm run deploy` needs `CLOUDFLARE_ACCOUNT_ID=8f2a7eb9d5e21ffa902a76cf62975c82`
in the environment and `wrangler login` done once.

## The data model — read this before changing any form

Three tables (`worker/schema.sql`), designed so **the questions are data, not
code**:

| Table | Holds |
| --- | --- |
| `people` | Identity that persists across years — email (unique), name, phone, orgs, subscribe state, tags, internal notes |
| `forms` | Each form's questions, as a JSON array of field definitions |
| `submissions` | One row per person per form; answers as a JSON object |
| `admins` | Who may sign in to the portal |

**Changing a question is a database edit, not a deploy.** Use the admin portal's
Forms tab, or `PUT /api/admin/forms/:slug`. The React form
(`src/components/DynamicForm.tsx`) renders whatever the API returns, in English
or Spanish. Do not hard-code form fields in the frontend.

Current forms: `register-2026` (the main one), `signup-2026` (email-only
capture), `map-suggestion` (ecosystem map additions), `register-2025`
(archived, closed).

## Conventions

- **Bilingual.** Every user-facing string goes in `src/lib/translations.ts`
  with `en` and `es`. Form field definitions carry `label_es`, `help_es`,
  `options_es`. Answers are stored in English so exports stay consistent.
- **Design tokens.** Colours come from Eileen's palette, defined once in
  `src/index.css` as `--brand-deep` (#36558F), `--brand-water` (#489FB5),
  `--brand-leaf` (#BFEDC1), `--brand-sun` (#EDB458), `--brand-berry`. The older
  `earth-*` / `nature-*` / `community-*` names are remapped onto these, so both
  vocabularies work. **Never hard-code a hex in a component.**
  Watch contrast: water and leaf are too light to carry white text.
- **Photography.** `src/assets/photos/` holds stills pulled from the two Woven
  Web films. Eileen explicitly does not want AI-generated or stock imagery.
- **Internal links use `<Link>`,** never `<a href="/...">` — a raw anchor does a
  full page reload.
- No `console.log` in shipped code; TypeScript strict mode is on.

## Secrets and where they live

| Secret | Where |
| --- | --- |
| `ADMIN_KEY` | Worker secret + `.admin-key.local` (gitignored). Fallback sign-in. |
| `RESEND_API_KEY` | Optional Worker secret. Unset — Cloudflare email is used. |
| Cloudflare auth | `wrangler login`, per machine. |

Nothing in `.env` is required for the site to build or run. `exports/` and
`worker/seed.sql` are gitignored because they contain member contact details.

## Deploying

`npm run deploy` publishes the Worker and the site together to
`https://cohere-signup.unforced.workers.dev`.

`cohereboulder.org` is **still on GitHub Pages** (`.github/workflows/deploy.yml`,
triggered by pushes to `main`) while the DNS move is pending. See
`DEPLOYMENT.md` for the migration runbook. Until that flip, a push to `main`
updates the public site and `npm run deploy` updates the Worker — do both.

## History

The 2025 stack was Supabase (auth, Postgres, edge functions) with the site on
GitHub Pages. That project became unreachable; the data was recovered and
migrated to D1 in July 2026, and the frontend's Supabase dependency was removed
entirely. `supabase/` is kept as an **archive only** — nothing there is
deployed or maintained. The project originated on Lovable.dev, which explains
the `src/components/ui/` shadcn scaffolding and some legacy naming.
