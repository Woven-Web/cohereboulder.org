# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

The website and member database for **COhere Boulder** — a ten-day community
container in Boulder, Colorado. **COhere Boulder 2026 runs October 15–25.**
This year's theme is *We Are Our Ecology*; the standing tagline is *Weaving Our
Resilience*.

The immediate goal is narrow: let people **find the site, register, and get on
the list**, and let the organizers read and manage who signed up. When a change
would help or hurt that, that is the tiebreaker.

The organizers are **Aaron (ag@unforced.org)**, **Benya (benya@wovenweb.org)**,
and **Eileen (emwalz@gmail.com)**. Eileen drives copy and visual direction;
Benya has driven the registration form's questions.

## Architecture

A React SPA and a single Cloudflare Worker. The Worker serves the built site as
static assets *and* the API, so everything is one origin — no CORS, and session
cookies work on the real domain. Member data lives in Cloudflare D1. **There is
no other backend.**

```
cohereboulder.org ─→ Worker "cohere-signup"
        ├── /                    static assets (dist/, SPA fallback)
        ├── /api/form/:slug      a form's questions            (public)
        ├── /api/events[/…]      community calendar, proxied from regenOS (public)
        ├── /api/config          what the SPA needs to know (regenOS flag + DID)
        ├── /xrpc/:nsid          regenOS sign-in/event-write proxy — 404s unless
        │                        REGENOS_LOGIN_ENABLED="true" (default: off)
        ├── /api/submit/:slug    a submission + confirmation   (public)
        ├── /  (POST)            legacy email-only capture     (public)
        ├── /unsubscribe         opt-out page, POST-confirmed  (public)
        ├── /api/auth/*          magic link + one-time code sign-in
        ├── /api/admin/*         admin JSON, behind the session cookie
        └── /admin               the admin portal, one self-contained HTML page
               ↓
        D1 `cohere`  +  KV: COHERE_AUTH (sessions), SIGNUPS (legacy mirror)
```

`www.cohereboulder.org` and `cohere-signup.unforced.workers.dev` serve the same
Worker; the workers.dev URL is handy for checking a deploy before the real
domain.

## Commands

```bash
npm install
npm run dev          # Vite dev server on :8080 (site only, talks to prod API)
npm run worker:dev   # wrangler dev — the Worker plus the built site
npm run build        # build the SPA into dist/
npm run typecheck    # the real type check — see the warning below
npm run lint
npm run smoke -- https://cohereboulder.org   # load pages in a browser, assert they rendered
npm run deploy       # typecheck, build, deploy Worker + site together
```

`npm run deploy` needs `CLOUDFLARE_ACCOUNT_ID=8f2a7eb9d5e21ffa902a76cf62975c82`
and a one-time `npx wrangler login`. Nothing in `.env` is required.

## Traps that have actually bitten

Read these before "verifying" anything.

> **Never verify with bare `npx tsc --noEmit`.** The root `tsconfig.json` is a
> solution-style config (`"files": []` plus project references), so that command
> reads no source files and exits 0 on broken code. Vite only transpiles, so it
> won't catch type errors either. On 2026-08-01 that pair shipped a
> `ReferenceError` that replaced the whole site with the error boundary for two
> days, while every check reported success. Use `npm run typecheck`.

> **A 200 is not proof the site works.** The app mounts client-side, so the
> served HTML is identical whether React renders or throws. Only a browser can
> tell — that is what `npm run smoke` is for, and CI runs it after every deploy.

> **`wrangler` needs Node 22+**, and `cloudflare/wrangler-action` bundles its own
> wrangler 3.x that cannot read `wrangler.jsonc` (it fails with a misleading
> "Missing entry-point"). The version in `package.json` and the `wranglerVersion`
> in `.github/workflows/deploy-worker.yml` must stay in sync.

> **`PUBLIC_BASE_URL` is where emailed sign-in links point.** Changing it to a
> hostname the Worker does not yet serve produces links that 404. It belongs in
> the same change as `routes`.

> **Declaring `routes` disables the workers.dev URL** unless `"workers_dev":
> true` is also set.

## The data model — read this before changing any form

Four tables (`worker/schema.sql`), designed so **the questions are data, not
code**:

| Table | Holds |
| --- | --- |
| `people` | Identity that persists across years — email (unique), name, phone, orgs, subscribe state, tags, internal notes, unsubscribe token |
| `forms` | Each form's questions as a JSON array, plus optional confirmation-email subject and body |
| `submissions` | One row per person per form; answers as a JSON object |
| `admins` | Who may sign in to the portal |

**Changing a question, or the confirmation email, is a database edit — not a
deploy.** Use the admin portal's Forms tab or `PUT /api/admin/forms/:slug`.
`src/components/DynamicForm.tsx` renders whatever the API returns, in English or
Spanish. **Never hard-code form fields in the frontend.**

Current forms: `register-2026` (the main one, with a confirmation email),
`signup-2026` (email-only capture), `map-suggestion` (ecosystem map additions),
`register-2025` (archived, closed).

A field definition looks like:

```json
{ "key": "volunteer_interest",
  "label": "Are you interested in volunteering?",
  "label_es": "¿Te interesa ser voluntario/a?",
  "help": "We'll email you with more info.",
  "type": "radio",
  "options": ["Yes", "No"], "options_es": ["Sí", "No"] }
```

`type` is one of `text`, `textarea`, `email`, `tel`, `radio`, `checkbox`,
`checkboxes`. Keys `full_name`, `email`, `phone`, `orgs` map onto `people`
columns; everything else lands in the answers JSON.

## Admin access

No passwords and no shared key. Organizers sign in at `/admin` with their email
and get both a magic link and a 6-digit code, valid ten minutes. Sessions are
HttpOnly cookies lasting 30 days, revoked on sign-out or when an address is
removed from `admins`. Manage who can sign in from the portal's "Who can sign
in" tab.

If email delivery ever breaks, the backstop is Cloudflare account access:
`wrangler d1 execute cohere --remote --command "INSERT ... INTO admins ..."`.

## Email

Sent through **Cloudflare Email Routing** from `cohere@wovenweb.org`
(`MAIL_FROM` in `wrangler.jsonc`). Two kinds go out: organizer sign-in mail, and
the registration confirmation defined on the form row.

Verified 2026-08-04: Cloudflare **does** deliver to ordinary recipients, not
only to verified Email Routing destinations. An earlier note in this file
claimed otherwise; it was wrong. `worker/src/auth.ts` still carries a Resend
path behind `RESEND_API_KEY` if a dedicated provider is ever wanted.

Any mail to members must carry the unsubscribe link built from
`people.unsubscribe_token` — `/unsubscribe?token=…`, which requires a POST to
confirm so scanners cannot unsubscribe people by following links.

## Conventions

- **Bilingual.** Every user-facing string goes in `src/lib/translations.ts` with
  `en` and `es`. Field definitions carry `label_es`, `help_es`, `options_es`.
  Answers are stored in English so exports stay consistent across languages.
- **Design tokens.** Colours come from Eileen's palette, defined once in
  `src/index.css`: `--brand-deep` (#36558F), `--brand-water` (#489FB5),
  `--brand-leaf` (#BFEDC1), `--brand-sun` (#EDB458), `--brand-berry`. The older
  `earth-*` / `nature-*` / `community-*` names are remapped onto these, so both
  vocabularies work. **Never hard-code a hex in a component.** Watch contrast:
  water and leaf are too light to carry white text.
- **Photography.** `src/assets/photos/` holds stills pulled from the two Woven
  Web films. Eileen explicitly does not want AI-generated or stock imagery, so
  new imagery should come from real COhere footage or photos.
- **Internal links use `<Link>`**, never `<a href="/…">` — a raw anchor forces a
  full page reload.
- **One API module.** All calls to the Worker go through `src/lib/api.ts`.
- No `console.log` in shipped code; TypeScript strict mode is on.

## Secrets

| Secret | Where |
| --- | --- |
| Cloudflare auth | `wrangler login`, per machine |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | GitHub repo secrets, for CI deploys |
| `RESEND_API_KEY` | Optional Worker secret, currently unset |

The CI token's permissions cannot be scoped below the Cloudflare account, so it
reaches every Worker and database in Unforced Development. That was accepted
deliberately — see `DEPLOYMENT.md`.

`exports/` and `worker/seed.sql` are gitignored: they hold member contact
details. Never commit them, and never paste member data into an artifact or any
external service.

## Deploying

`npm run deploy` publishes the Worker and site together to `cohereboulder.org`,
`www.cohereboulder.org`, and the workers.dev URL. Pushing to `main` does the
same via `.github/workflows/deploy-worker.yml`, which typechecks, builds,
deploys, then smoke-tests the live pages in headless Chromium.

GitHub Pages is retired — the Worker serves the domain directly, so deep links
return 200 and the API is same-origin.

## Open threads

- The **"I want to host an event"** question was dropped from the 2026 form, but
  the site promises a community-built calendar. In 2025, 48 of 144 registrants
  used that question to offer to host. Restoring it is a Forms-tab edit.
- The **berry** hex is an estimate (`#A6216E`) pending Eileen's exact value.
- The community calendar reads the regenOS commons (scenius.social) through the
  Worker: `/api/events` + `/api/events/:did/:rkey` (`worker/src/events.ts`,
  no CORS upstream so the browser can't go direct). The Luma embed is kept as
  the automatic fallback whenever regenOS is unconfigured, unreachable, or
  simply empty (`src/lib/events.ts` decides), so the page can only get better.
  `REGENOS_COLLECTIVE_DID` points at the COhere Boulder scene
  (`did:plc:w54s52ycbw5lreyhlzexredb`, minted 2026-08-30). Smoke-test locally
  with `npx wrangler dev --var REGENOS_COLLECTIVE_DID:<scene did>`.
- **Phase 2 (sign-in + on-site event hosting) is built but INERT.** The whole
  lane — the `/xrpc` proxy (`worker/src/regenos-auth.ts`), the calendar page's
  sign-in panel and event form, and `/login` — is dead until
  `REGENOS_LOGIN_ENABLED` is set to `"true"` in `wrangler.jsonc` vars. Do not
  flip it before regenOS's `ALLOWED_APP_ORIGINS` includes
  `https://cohereboulder.org`: until then beginSignup's magic links would point
  at scenius.social and set their cookie there, stranding people mid-sign-in.
  The proxy exists because regenOS's `__Host-rs_session` cookie can only land
  on the origin that emitted the response; it forwards Cookie / Origin /
  Sec-Fetch-Site verbatim, relays every Set-Cookie via `getSetCookie()`, and
  passes 3xx through (`redirect: "manual"`) so a returning user's verifyEmail
  `302 /` reaches the browser with its cookie. Exercise it locally against
  `scripts/regenos-mock.mjs` and prove it with `scripts/regenos-e2e.mjs` (usage
  in each file's header) — never run `beginSignup` against prod with a real
  email; it sends real mail and mints real state.
- `mail.cohereboulder.org` is proxied in Cloudflare DNS, with a `_dc-mx`
  placeholder preserving delivery. Harmless today because that domain has no
  mail, but mail records should be DNS-only if it ever does.

## History

The 2025 stack was Supabase (auth, Postgres, edge functions) with the site on
GitHub Pages. That project went dormant and unreachable; its 144 profiles and
139 registrations were recovered and migrated into D1 in July 2026, and the
frontend's Supabase dependency was removed entirely. `supabase/` is kept as an
**archive only** — nothing in it is deployed, maintained, or linted. The project
originated on Lovable.dev, which explains the `src/components/ui/` shadcn
scaffolding and some legacy naming.
