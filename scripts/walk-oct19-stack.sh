#!/usr/bin/env bash
# A long-running local stack for the Oct 19 walk: a fresh local D1/KV, the regenOS mock
# (MOCK_NOTIFY=1) with a few events on Oct 19–22, the Resend mock (so a newsletter goes nowhere),
# and `wrangler dev` with the notification senders on and emailed links pointing at this stack.
# Nothing leaves this machine. Writes $STATE/env (URLs, persist dir, link secret) and runs until
# killed; on exit it stops only the processes it started.
#
#   npm run build && bash scripts/walk-oct19-stack.sh <state-dir>
set -euo pipefail
cd "$(dirname "$0")/.."
STATE="${1:?usage: walk-oct19-stack.sh <state-dir>}"
mkdir -p "$STATE"
OFFSET=${E2E_PORT_OFFSET:-0}
P_WORKER=$(( 19710 + OFFSET )); P_INSPECT=$(( 19711 + OFFSET )); P_MOCK=$(( 19712 + OFFSET )); P_RESEND=$(( 19713 + OFFSET ))
PERSIST=(--persist-to "$STATE/d1")
export WRANGLER_LOG_PATH="$STATE/wrangler.log"
export npm_config_logs_dir="$STATE/npm-logs"
PIDS=()
stop() { local pid; for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill -TERM -- "-$pid" >/dev/null 2>&1 || true; done; wait >/dev/null 2>&1 || true; }
trap stop EXIT
wait_for() { local tries=60; while ! curl -s -o /dev/null "$1" 2>/dev/null; do tries=$((tries - 1)); [ "$tries" -le 0 ] && { echo "$2 never became ready"; exit 1; }; sleep 1; done; }

LINK_SECRET="walk-link-secret-$$"
npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=worker/schema.sql >/dev/null
npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=worker/migrations/0002_register_2026_refresh.sql >/dev/null
npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=scripts/fixtures/look-companion.sql >/dev/null

MOCK_NOTIFY=1 PORT="$P_MOCK" setsid node scripts/regenos-mock.mjs >"$STATE/mock.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_MOCK/xrpc/social.scenius.getEvents" "regenOS mock"
PORT="$P_RESEND" setsid node scripts/resend-mock.mjs >"$STATE/resend.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_RESEND/_messages" "Resend mock"

setsid node node_modules/wrangler/bin/wrangler.js dev --port "$P_WORKER" --inspector-port "$P_INSPECT" "${PERSIST[@]}" --test-scheduled \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_SERVICE_TOKEN:mock-token \
  --var "REGENOS_BASE_URL:http://127.0.0.1:$P_MOCK" \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var NOTIFY_PAUSED:false --var COMPANION_PUSH_PAUSED:true \
  --var "NOTIFY_LINK_SECRET:$LINK_SECRET" \
  --var "PUBLIC_BASE_URL:http://127.0.0.1:$P_WORKER" \
  --var "RESEND_API_BASE:http://127.0.0.1:$P_RESEND" --var RESEND_API_KEY:mock-key \
  --var COMPANION_START_DATE:2026-10-15 --var COMPANION_END_DATE:2026-10-25 \
  >"$STATE/worker.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_WORKER/" "wrangler dev"

cat >"$STATE/env" <<EOF
BASE=http://127.0.0.1:$P_WORKER
MOCK=http://127.0.0.1:$P_MOCK
RESEND=http://127.0.0.1:$P_RESEND
PERSIST=$STATE/d1
NOTIFY_LINK_SECRET=$LINK_SECRET
EOF
echo "stack ready: $(tr '\n' ' ' <"$STATE/env")"
wait
