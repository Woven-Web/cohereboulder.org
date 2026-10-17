#!/usr/bin/env bash
# Runs scripts/newsletter-image-e2e.mjs hermetically: a fresh local D1/KV with one
# seeded admin session, scripts/resend-mock.mjs for "Send me a test", and
# `wrangler dev`. Nothing leaves this machine; no email is sent, no production
# or scenius.social endpoint is contacted.
#
#   npm run build && E2E_PORT_OFFSET=2300 bash scripts/newsletter-image-e2e.sh [shots-dir]
#
# Ports: 7300-7302 + E2E_PORT_OFFSET. It only stops processes it started.

set -euo pipefail
cd "$(dirname "$0")/.."
SHOTS_DIR="${1:-shots-reminders}"
OFFSET=${E2E_PORT_OFFSET:-0}
[[ "$OFFSET" =~ ^[0-9]+$ ]] || { echo "E2E_PORT_OFFSET must be a nonnegative integer"; exit 2; }
P_WORKER=$(( 7300 + OFFSET )); P_INSPECT=$(( 7301 + OFFSET )); P_RESEND=$(( 7302 + OFFSET ))

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/nl-image-e2e-XXXXXX")"
PERSIST=(--persist-to "$SCRATCH/state")
export WRANGLER_LOG_PATH="$SCRATCH/wrangler.log"
export npm_config_logs_dir="$SCRATCH/npm-logs"
PIDS=()
stop() { local pid; for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill -TERM -- "-$pid" >/dev/null 2>&1 || true; done; wait >/dev/null 2>&1 || true; }
trap 'stop; rm -rf "$SCRATCH"' EXIT
wait_for() { local tries=60; while ! curl -s -o /dev/null "$1" 2>/dev/null; do tries=$((tries - 1)); [ "$tries" -le 0 ] && { echo "::error::$2 never became ready"; exit 1; }; sleep 1; done; }

TOKEN="nl-image-e2e-$(date +%s)-$$"
HASH=$(node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$TOKEN")
npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=worker/schema.sql >/dev/null
npx wrangler d1 execute cohere --local "${PERSIST[@]}" --command \
  "INSERT INTO admins (email, name, added_by, created_at) VALUES ('ci-e2e@cohere.test','CI E2E','ci', strftime('%Y-%m-%dT%H:%M:%fZ','now'))" >/dev/null
npx wrangler kv key put --binding COHERE_AUTH --local "${PERSIST[@]}" "session:$HASH" \
  '{"email":"ci-e2e@cohere.test","name":"CI E2E","createdAt":"2026-01-01T00:00:00Z"}' >/dev/null

PORT="$P_RESEND" setsid node scripts/resend-mock.mjs >"$SCRATCH/resend.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_RESEND/_messages" "Resend mock"
setsid node node_modules/wrangler/bin/wrangler.js dev --port "$P_WORKER" --inspector-port "$P_INSPECT" "${PERSIST[@]}" \
  --var ADMIN_EMAIL_LOGIN:true \
  --var REGENOS_LOGIN_ENABLED:false \
  --var "RESEND_API_BASE:http://127.0.0.1:$P_RESEND" \
  --var RESEND_API_KEY:mock-key \
  --var "PUBLIC_BASE_URL:http://127.0.0.1:$P_WORKER" \
  >"$SCRATCH/worker.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_WORKER/" "wrangler dev"

status=0
node scripts/newsletter-image-e2e.mjs "http://127.0.0.1:$P_WORKER" "$TOKEN" "http://127.0.0.1:$P_RESEND" "$SHOTS_DIR" || status=1
[ "$status" -eq 0 ] || { echo "--- worker log (tail) ---"; tail -60 "$SCRATCH/worker.log"; }
exit "$status"
