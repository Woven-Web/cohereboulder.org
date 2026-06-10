# cohere-signup Worker

Simple email capture for cohereboulder.org — no Supabase involved. Signups are
stored in Cloudflare KV.

- **Live endpoint:** `https://cohere-signup.ag-8f2.workers.dev/`
- **KV namespace:** `SIGNUPS` (`e7cb04113ed14308bff4b85dbbe35ac7`)
- The frontend (`src/components/EmailSignup.tsx`) posts here; override with
  `VITE_SIGNUP_URL` if the endpoint ever moves.

## API

```
POST /      {"email": "...", "name?": "...", "source?": "hero|footer|..."}
            → {"ok": true}
            CORS-restricted to cohereboulder.org (+ localhost:8080 for dev).
            Includes a hidden "website" honeypot field for spam.

GET /list   Authorization: Bearer <ADMIN_KEY>
            → {"count": N, "signups": [...]}
```

## Exporting emails

```bash
curl -s https://cohere-signup.ag-8f2.workers.dev/list \
  -H "Authorization: Bearer $(cat .admin-key.local)" | jq -r '.signups[].email'
```

The admin key lives in `.admin-key.local` (gitignored) and as the `ADMIN_KEY`
Worker secret. Rotate with `npx wrangler secret put ADMIN_KEY`.

## Deploying changes

```bash
cd workers/email-signup
npx wrangler deploy
```
