#!/usr/bin/env bash
# Starts a private regenOS mock and wrangler dev (own ports, own persist dir), takes the copy-pass
# screenshots into $1, and stops only what it started.  Needs dist/ built.
set -euo pipefail
OUT="$1"; MOCK=29301; WORK=29300; INSPECT=29302
STATE="$(mktemp -d)"; ARGS=(--persist-to "$STATE"); PIDS=()
trap 'for p in "${PIDS[@]}"; do kill -- -"$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done; rm -rf "$STATE"' EXIT
npx wrangler d1 execute cohere --local "${ARGS[@]}" --file=worker/schema.sql >/dev/null
npx wrangler d1 execute cohere --local "${ARGS[@]}" --file=worker/migrations/0002_register_2026_refresh.sql >/dev/null
npx wrangler d1 execute cohere --local "${ARGS[@]}" --file=scripts/fixtures/look-companion.sql >/dev/null
PORT=$MOCK setsid node scripts/regenos-mock.mjs >"$STATE/mock.log" 2>&1 & PIDS+=("$!")
setsid node node_modules/wrangler/bin/wrangler.js dev --port $WORK --inspector-port $INSPECT "${ARGS[@]}" \
  --var REGENOS_LOGIN_ENABLED:true --var REGENOS_BASE_URL:http://127.0.0.1:$MOCK --var REGENOS_COLLECTIVE_DID:did:plc:mockscene >"$STATE/worker.log" 2>&1 & PIDS+=("$!")
for i in $(seq 60); do curl -fs "http://127.0.0.1:$WORK/" >/dev/null 2>&1 && break; sleep 1; done
node scripts/copy-shots.mjs "http://127.0.0.1:$WORK" "http://127.0.0.1:$MOCK" "$OUT"
