# Build a calendar consumer with the COhere integration

This is a worked example of this repository's Worker + React integration, not
an installable SDK. Start with the local mock below; no production account,
email delivery, or service token is needed. The integration uses the
`social.scenius.*` wire names present in the code. Do not rename them to a new
lexicon namespace without checking the upstream contract and updating the mock.

## Run the complete example locally

Use Node 22 or newer, as in CI. From the repository root:

```sh
npm ci
npx playwright install chromium
npm run lint
npm run typecheck
npm test
npm run build
bash scripts/ci-e2e.sh
```

The last command starts local Workers and `scripts/regenos-mock.mjs`, seeds
synthetic organizer state, exercises sign-in, sharing, event management,
permissions, and proposal approval, then stops the servers. It uses its own
`.wrangler-ci-e2e-state` directory, which it clears between runs. It uses fixed
ports in the 28xxx range: run one copy at a time. No live proposal or email is
created. Do not substitute a production upstream in this test harness.

For a browser walkthrough, after building, run these in separate terminals:

```sh
# Terminal 1: local AppView test double
node scripts/regenos-mock.mjs
```

```sh
# Terminal 2: Worker and built frontend on one origin
npx wrangler dev --port 8789 \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:9944 \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
```

Open `http://localhost:8789/calendar`. The test wizard link is
`http://localhost:8789/login?token=tok-good`; this token belongs only to the
mock. `node scripts/regenos-e2e.mjs http://localhost:8789` walks the flow for you.

A plain Vite server serves only the frontend; it is not the same-origin Worker
example. `VITE_SIGNUP_URL` can override the frontend API origin for development
([api.ts](../src/lib/api.ts)), but use the Worker for cookie-bearing flows.

## Three distinct routes into the same calendar

| Flow | Browser endpoint | Authority / storage | Code |
| --- | --- | --- | --- |
| Public discovery | `GET /api/events`, `GET /api/events/:did/:rkey` | Public AppView reads; no organizer token in the browser | [events.ts](../worker/src/events.ts), [frontend mapping](../src/lib/events.ts) |
| Organizer calendar and proposal approval | `/api/admin/*` | COhere admin session, then server-held regenOS service token | [regenos-service.ts](../worker/src/regenos-service.ts), [proposals.ts](../worker/src/proposals.ts) |
| Personal account sign-in and hosting | `/xrpc/social.scenius.*` | regenOS cookies, same origin; gated by `REGENOS_LOGIN_ENABLED` | [regenos-auth.ts](../worker/src/regenos-auth.ts), [frontend client](../src/lib/regenos.ts) |

`/propose` is an accountless submission into COhere's D1 approval queue. It does
not itself publish an event. Organizer approval publishes through the service
lane. This is different from personal-account hosting; do not describe an
organizer service-token write as a personally owned event.

## What to reuse, and what to replace

Keep these seams together when adapting the example:

- **Public mapping:** the Worker calls `getEvents` with a scene DID and
  `getEvent` with an atproto URI, filters the result, and returns the compact
  `CommunityEvent` shape. The frontend does not depend on every upstream field.
  Its empty/unconfigured response selects the Luma fallback; transient failures
  throw, preserving the last successful React Query result rather than
  silently replacing it. See the two `events.ts` files linked above.
- **Dates and export:** [eventForm.ts](../src/lib/eventForm.ts) maps form inputs;
  [ics.ts](../src/lib/ics.ts) builds a single-event download. The scene's
  subscription URL is separate: it follows changes across the entire calendar.
- **Session boundary:** browser calls go to a same-origin `/xrpc` proxy. Its
  explicit method allowlist limits what this app exposes. Only `__Host-rs_`
  cookies cross the boundary; COhere's admin cookie and visitor IP headers do
  not. Preserve Origin and Sec-Fetch headers for upstream checks; drop upstream
  CORS grants. Redirects must resolve to this app's origin. Tests live in
  [regenos-auth.test.ts](../worker/src/regenos-auth.test.ts).
- **Service boundary:** `REGENOS_SERVICE_TOKEN` stays in the Worker. Organizer
  authentication and authorization happen before a service call. Preserve this
  separation even if a new app has a different organizer identity system.
- **Mock:** [regenos-mock.mjs](../scripts/regenos-mock.mjs) models the contracts
  exercised by this consumer, not the entire AppView. Extend it alongside a new
  feature, then test against a staging upstream before enabling that feature.

Replace the scene DID, domains, D1/KV resources, mail sender, organizer access,
branding, and fallback calendar when building another app. This repository's
`wrangler.jsonc` points at COhere resources: do not deploy it unchanged for a
new application.

## Production configuration and rollout

| Setting | Purpose |
| --- | --- |
| `REGENOS_BASE_URL` | Server-side AppView origin |
| `REGENOS_WEB_URL` | Web origin for the scene calendar subscription |
| `REGENOS_COLLECTIVE_DID` | Scene authority and listing filter |
| `REGENOS_SERVICE_TOKEN` | Worker secret for organizer actions; never a `VITE_*` variable |
| `REGENOS_LOGIN_ENABLED` | Personal-account lane enabled only when its value is `true` |
| `PUBLIC_BASE_URL` | COhere organizer email-link origin, separate from upstream account onboarding |

Before enabling personal sign-in on a new origin, have the upstream operator
confirm its allowed app origins and returning/new-user link destinations. The
proxy intentionally forwards the browser Origin. Test a returning user, a new
user, logout, denied hosting, and cookie isolation on that origin. An upstream
configuration change alone does not implement missing frontend features.

**Current capability limit:** this consumer implements custodial email sign-in,
not atproto OAuth or public RSVP. `/oauth-client-metadata.json` returns 404 and
`beginOAuth`, `oauthCallback`, and `rsvp` are not exposed by the proxy. A future
OAuth/RSVP feature needs its complete UI, callback, operator configuration, and
end-to-end tests before restoring these routes. Keeping these absent does not
turn off the existing email signup wizard.

Public record creation also does not prove discovery by another application.
For federation work, separately verify relay ingestion and the target app's
indexing of a concrete record. This guide does not claim SmokeSignal or
Dandelion can currently discover COhere events.

## Release checks

[PR checks](../.github/workflows/check.yml) run lint, typecheck, unit tests,
build, and mock-backed browser tests without production secrets. The
[deploy workflow](../.github/workflows/deploy-worker.yml) repeats the gates,
applies D1 migrations, deploys, and browser-smokes the real site.

The share tests mock browser share/clipboard APIs and check fallback behavior,
English/Spanish labels and mobile layout. They do not prove a phone's OS share
sheet. A real-device check remains useful before claiming that platform works.
