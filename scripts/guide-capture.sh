#!/usr/bin/env bash
# Captures the "how to use the COhere app" guide (guide/): phone screenshots, short videos and a GIF.
#
# Signed-in screens come from a hermetic local stack: a fresh local D1/KV, the regenOS mock in its
# guide mode (MOCK_GUIDE=1: neutral names) and `wrangler dev`. To look like the real app it first
# READS (GET only) the public calendar, its event photos, the registration form and today's practice
# from the live site, and loads copies into the LOCAL stores. Nothing is written anywhere but this
# machine: every wrangler call below is --local, and nothing is sent.
#
#   npm run build && E2E_PORT_OFFSET=2400 bash scripts/guide-capture.sh guide        # capture
#   SERVE=1 E2E_PORT_OFFSET=2400 bash scripts/guide-capture.sh                        # just run the stack
#
# It only ever stops processes it started (their own process groups).

set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-}"
LIVE="${GUIDE_LIVE:-https://cohereboulder.org}"
OFFSET=${E2E_PORT_OFFSET:-0}
P_WORKER=$(( 28990 + OFFSET )); P_INSPECT=$(( 28991 + OFFSET )); P_MOCK=$(( 28992 + OFFSET )); P_PUSH=$(( 28993 + OFFSET ))

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/guide-capture-XXXXXX")"
PERSIST_DIR="$SCRATCH/state"
export WRANGLER_LOG_PATH="$SCRATCH/wrangler.log"
export npm_config_logs_dir="$SCRATCH/npm-logs"
PERSIST=(--local --persist-to "$PERSIST_DIR")
PIDS=()
stop() { local pid; for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill -TERM -- "-$pid" >/dev/null 2>&1 || true; done; wait >/dev/null 2>&1 || true; }
trap 'stop; rm -rf "$SCRATCH"' EXIT
wait_for() { local tries=60; while ! curl -s -o /dev/null "$1" 2>/dev/null; do tries=$((tries - 1)); [ "$tries" -le 0 ] && { echo "::error::$2 never became ready"; exit 1; }; sleep 1; done; }
d1() { npx wrangler d1 execute cohere "${PERSIST[@]}" "$@" >/dev/null; }

# 1. Read the live site (GET only) into scratch files.
node scripts/guide-fetch-live.mjs "$LIVE" "$SCRATCH/live"

# 2. Local stores.
d1 --file=worker/schema.sql
d1 --file=worker/migrations/0002_register_2026_refresh.sql
d1 --file="$SCRATCH/live/seed.sql"
for f in "$SCRATCH"/live/img/*.bin; do
  [ -e "$f" ] || continue
  key="$(cat "${f%.bin}.key")"; meta="$(cat "${f%.bin}.meta")"
  npx wrangler kv key put --binding SIGNUPS "${PERSIST[@]}" "$key" --path "$f" --metadata "$meta" >/dev/null
done

# 3. The mock, a loopback push receiver (so Phone notifications can be switched on) and the Worker.
MOCK_NOTIFY=1 MOCK_RICH_SEED=1 MOCK_GUIDE=1 MOCK_GUIDE_EVENTS="$SCRATCH/live/events.json" GUIDE_SEATS="$(cat "$SCRATCH/live/seats.txt")" \
  PORT="$P_MOCK" setsid node scripts/regenos-mock.mjs >"$SCRATCH/mock.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_MOCK/xrpc/social.scenius.getEvents" "regenOS mock"
KEYS_FILE="$SCRATCH/push-keys.json"
PORT="$P_PUSH" PWA_KEYS_FILE="$KEYS_FILE" setsid node scripts/pwa-push-mock.mjs >"$SCRATCH/push.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_PUSH/messages" "push mock"
cp "$KEYS_FILE" "$SCRATCH/live/push-keys.json"
PUBLIC_KEY=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).publicKey)' "$KEYS_FILE")
PRIVATE_KEY=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).privateKey)' "$KEYS_FILE")
setsid node node_modules/wrangler/bin/wrangler.js dev --port "$P_WORKER" --inspector-port "$P_INSPECT" --persist-to "$PERSIST_DIR" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_SERVICE_TOKEN:mock-token \
  --var "REGENOS_BASE_URL:http://127.0.0.1:$P_MOCK" \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var "VAPID_PUBLIC_KEY:$PUBLIC_KEY" --var "VAPID_PRIVATE_KEY:$PRIVATE_KEY" --var VAPID_SUBJECT:mailto:test@example.test \
  --var NOTIFY_PAUSED:true --var NOTIFY_LINK_SECRET:guide-capture-secret \
  --var COMPANION_LOCAL_TEST_MODE:true --var "COMPANION_LOCAL_PUSH_MOCK:http://127.0.0.1:$P_PUSH" \
  >"$SCRATCH/worker.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_WORKER/" "wrangler dev"

BASE="http://127.0.0.1:$P_WORKER"; MOCK="http://127.0.0.1:$P_MOCK"
# 4. What members have already shared, written through the local Worker as them.
node scripts/guide-seed.mjs "$BASE" "$SCRATCH/live"

if [ "${SERVE:-0}" = "1" ]; then
  echo "guide stack: $BASE (mock $MOCK, scratch $SCRATCH). Sign in with the cookie __Host-rs_session=mock-peer. Ctrl-C to stop."
  wait
fi
[ -n "$OUT" ] || exit 0
status=0
node scripts/guide-capture.mjs "$BASE" "$LIVE" "$OUT" "$SCRATCH/live" || status=1
[ "$status" -eq 0 ] || { echo "--- worker log (tail) ---"; tail -40 "$SCRATCH/worker.log"; }
exit "$status"
