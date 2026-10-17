#!/usr/bin/env bash
# Runs scripts/calendar-desktop-e2e.mjs (and, with a shots dir, scripts/desktop-walk.mjs)
# hermetically: a fresh local D1/KV, the regenOS mock (MOCK_NOTIFY=1, so there are events that
# just ended) and `wrangler dev`. Nothing leaves this machine; no production or scenius.social
# endpoint is contacted and nothing is sent.
#
#   npm run build && E2E_PORT_OFFSET=1800 bash scripts/calendar-desktop-e2e.sh [shots-dir]
#
# It only ever stops processes it started (their own process groups).

set -euo pipefail
cd "$(dirname "$0")/.."
SHOTS_DIR="${1:-}"
OFFSET=${E2E_PORT_OFFSET:-0}
P_WORKER=$(( 28980 + OFFSET )); P_INSPECT=$(( 28981 + OFFSET )); P_MOCK=$(( 28982 + OFFSET ))

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/cal-desktop-e2e-XXXXXX")"
PERSIST_DIR="$SCRATCH/state"
export WRANGLER_LOG_PATH="$SCRATCH/wrangler.log"
export npm_config_logs_dir="$SCRATCH/npm-logs"
PERSIST=(--persist-to "$PERSIST_DIR")
PIDS=()
stop() { local pid; for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill -TERM -- "-$pid" >/dev/null 2>&1 || true; done; wait >/dev/null 2>&1 || true; }
trap 'stop; rm -rf "$SCRATCH"' EXIT
wait_for() { local tries=60; while ! curl -s -o /dev/null "$1" 2>/dev/null; do tries=$((tries - 1)); [ "$tries" -le 0 ] && { echo "::error::$2 never became ready"; exit 1; }; sleep 1; done; }

npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=worker/schema.sql >/dev/null
npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=worker/migrations/0002_register_2026_refresh.sql >/dev/null
npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=scripts/fixtures/look-companion.sql >/dev/null

MOCK_NOTIFY=1 PORT="$P_MOCK" setsid node scripts/regenos-mock.mjs >"$SCRATCH/mock.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_MOCK/xrpc/social.scenius.getEvents" "regenOS mock"
setsid node node_modules/wrangler/bin/wrangler.js dev --port "$P_WORKER" --inspector-port "$P_INSPECT" "${PERSIST[@]}" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_SERVICE_TOKEN:mock-token \
  --var "REGENOS_BASE_URL:http://127.0.0.1:$P_MOCK" \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  >"$SCRATCH/worker.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_WORKER/" "wrangler dev"

BASE="http://127.0.0.1:$P_WORKER"; MOCK="http://127.0.0.1:$P_MOCK"
status=0
# The walk first: it wants a member who has not yet shared a harvest, which the e2e then does.
if [ -n "$SHOTS_DIR" ] && [ "${WALK:-1}" = "1" ]; then
  node scripts/desktop-walk.mjs "$BASE" "$MOCK" "$SHOTS_DIR" || status=1
fi
if [ -n "$SHOTS_DIR" ] && [ "${WALKMOCK:-0}" = "1" ]; then
  node scripts/walk-mock.mjs "$BASE" "$MOCK" "$SHOTS_DIR" || status=1
fi
[ "${E2E:-1}" = "0" ] || node scripts/calendar-desktop-e2e.mjs "$BASE" "$MOCK" ${SHOTS_DIR:+"$SHOTS_DIR/e2e"} || status=1
[ "$status" -eq 0 ] || { echo "--- worker log (tail) ---"; tail -60 "$SCRATCH/worker.log"; }
exit "$status"
