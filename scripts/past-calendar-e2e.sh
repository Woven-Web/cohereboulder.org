#!/usr/bin/env bash
# Runs scripts/past-calendar-e2e.mjs twice, hermetically: a fresh local D1/KV, the regenOS mock
# standing in for both the appview and the collective's PDS, and `wrangler dev`. First with nothing
# upcoming, then with something upcoming. Nothing leaves this machine.
#
#   npm run build && bash scripts/past-calendar-e2e.sh [shots-dir]
#
# It only ever stops processes it started (their own process groups).

set -euo pipefail
cd "$(dirname "$0")/.."
SHOTS_DIR="${1:-}"
OFFSET=${E2E_PORT_OFFSET:-0}
P_WORKER=$(( 29080 + OFFSET )); P_INSPECT=$(( 29081 + OFFSET )); P_MOCK=$(( 29082 + OFFSET ))
SCENE=did:plc:mockscene

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/past-calendar-e2e-XXXXXX")"
export WRANGLER_LOG_PATH="$SCRATCH/wrangler.log"
export npm_config_logs_dir="$SCRATCH/npm-logs"
PIDS=()
stop() { local pid; for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill -TERM -- "-$pid" >/dev/null 2>&1 || true; done; wait >/dev/null 2>&1 || true; PIDS=(); }
trap 'stop; rm -rf "$SCRATCH"' EXIT
wait_for() { local tries=60; while ! curl -s -o /dev/null "$1" 2>/dev/null; do tries=$((tries - 1)); [ "$tries" -le 0 ] && { echo "::error::$2 never became ready"; exit 1; }; sleep 1; done; }

status=0
for mode in nothing-upcoming upcoming; do
  # Fresh state each time: the Worker's edge cache would otherwise answer the second mode from the first.
  PERSIST=(--persist-to "$SCRATCH/state-$mode")
  npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=worker/schema.sql >/dev/null
  npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=scripts/fixtures/look-companion.sql >/dev/null

  MOCK_PAST_FESTIVAL="$mode" PORT="$P_MOCK" setsid node scripts/regenos-mock.mjs >"$SCRATCH/mock-$mode.log" 2>&1 & PIDS+=("$!")
  wait_for "http://127.0.0.1:$P_MOCK/xrpc/social.scenius.getEvents" "regenOS mock"
  setsid node node_modules/wrangler/bin/wrangler.js dev --port "$P_WORKER" --inspector-port "$P_INSPECT" "${PERSIST[@]}" \
    --var REGENOS_LOGIN_ENABLED:true \
    --var REGENOS_SERVICE_TOKEN:mock-token \
    --var "REGENOS_BASE_URL:http://127.0.0.1:$P_MOCK" \
    --var "REGENOS_WEB_URL:http://127.0.0.1:$P_MOCK" \
    --var "REGENOS_PDS_URL:http://127.0.0.1:$P_MOCK" \
    --var "REGENOS_PDS_DID:$SCENE" \
    --var "REGENOS_COLLECTIVE_DID:$SCENE" \
    >"$SCRATCH/worker-$mode.log" 2>&1 & PIDS+=("$!")
  wait_for "http://127.0.0.1:$P_WORKER/" "wrangler dev"

  node scripts/past-calendar-e2e.mjs "http://127.0.0.1:$P_WORKER" "$mode" ${SHOTS_DIR:+"$SHOTS_DIR"} || status=1
  [ "$status" -eq 0 ] || { echo "--- worker log (tail) ---"; tail -40 "$SCRATCH/worker-$mode.log"; }
  stop
done
exit "$status"
