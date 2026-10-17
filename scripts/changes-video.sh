#!/usr/bin/env bash
# Records the captioned video tour of the Oct 16–17 changes (video-tour/) on a hermetic local stack:
# a fresh local D1/KV, the regenOS mock (neutral names, a fuller roster, events that just ended, and
# setMembership able to add people), a loopback push receiver and `wrangler dev`. Nothing is read
# from or written to production, and nothing is sent: every wrangler call is --local, there is no
# mail transport (no RESEND key) and the notification senders are paused.
#
#   npm run build && E2E_PORT_OFFSET=2800 bash scripts/changes-video.sh [video-tour]
#   TOUR_ONLY=01,04 ...   re-records only those segments, then rebuilds the tour from all of them
#
# It only ever stops processes it started (their own process groups).

set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-video-tour}"
OFFSET=${E2E_PORT_OFFSET:-0}
[[ "$OFFSET" =~ ^[0-9]+$ ]] || { echo "E2E_PORT_OFFSET must be a nonnegative integer"; exit 2; }
P_WORKER=$(( 28970 + OFFSET )); P_INSPECT=$(( 28971 + OFFSET )); P_MOCK=$(( 28972 + OFFSET )); P_PUSH=$(( 28973 + OFFSET ))

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/changes-video-XXXXXX")"
PERSIST_DIR="$SCRATCH/state"
export WRANGLER_LOG_PATH="$SCRATCH/wrangler.log"
export npm_config_logs_dir="$SCRATCH/npm-logs"
PERSIST=(--local --persist-to "$PERSIST_DIR")
PIDS=()
stop() { local pid; for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill -TERM -- "-$pid" >/dev/null 2>&1 || true; done; wait >/dev/null 2>&1 || true; }
trap 'stop; rm -rf "$SCRATCH"' EXIT
wait_for() { local tries=60; while ! curl -s -o /dev/null "$1" 2>/dev/null; do tries=$((tries - 1)); [ "$tries" -le 0 ] && { echo "::error::$2 never became ready"; exit 1; }; sleep 1; done; }
d1() { npx wrangler d1 execute cohere "${PERSIST[@]}" "$@" >/dev/null; }

# 1. Local D1: the schema, the 2026 form, today's practice, and one person registered for 2026
#    who is not yet on the members roster (the Board segment signs in as them).
d1 --file=worker/schema.sql
d1 --file=worker/migrations/0002_register_2026_refresh.sql
d1 --file=scripts/fixtures/look-companion.sql
d1 --command "INSERT INTO people (id, email, name, phone, orgs, subscribed, unsubscribe_token, source, created_at, updated_at) VALUES
  ('p-reg','reg@cohere.test','Reg Alvarez',NULL,NULL,1,'tok-reg','form:register-2026','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
  INSERT INTO submissions (id, person_id, form_slug, event, data, created_at, updated_at) VALUES
  ('s-reg','p-reg','register-2026','october2026','{\"how_did_you_hear\":\"a friend\"}','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');"

# 2. The 8 PM email, rendered by the real eveningEmail() (worker/src/render-digest-email.test.ts).
mkdir -p "$SCRATCH/digest"
RENDER_DIGEST="$SCRATCH/digest" npx vitest run worker/src/render-digest-email.test.ts >/dev/null

# 3. The mock, a loopback push receiver (so Phone notifications can be on) and the Worker.
MOCK_NOTIFY=1 MOCK_RICH_SEED=1 MOCK_GUIDE=1 MOCK_SETMEMBERSHIP_ADDS=1 \
  PORT="$P_MOCK" setsid node scripts/regenos-mock.mjs >"$SCRATCH/mock.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_MOCK/xrpc/social.scenius.getEvents" "regenOS mock"
KEYS_FILE="$SCRATCH/push-keys.json"
PORT="$P_PUSH" PWA_KEYS_FILE="$KEYS_FILE" setsid node scripts/pwa-push-mock.mjs >"$SCRATCH/push.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_PUSH/messages" "push mock"
PUBLIC_KEY=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).publicKey)' "$KEYS_FILE")
PRIVATE_KEY=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).privateKey)' "$KEYS_FILE")
BASE="http://127.0.0.1:$P_WORKER"; MOCK="http://127.0.0.1:$P_MOCK"
setsid node node_modules/wrangler/bin/wrangler.js dev --port "$P_WORKER" --inspector-port "$P_INSPECT" --persist-to "$PERSIST_DIR" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_SERVICE_TOKEN:mock-token \
  --var "REGENOS_BASE_URL:$MOCK" \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var AUTO_MEMBER_ON_SIGNIN:true \
  --var "PUBLIC_BASE_URL:$BASE" \
  --var "VAPID_PUBLIC_KEY:$PUBLIC_KEY" --var "VAPID_PRIVATE_KEY:$PRIVATE_KEY" --var VAPID_SUBJECT:mailto:test@example.test \
  --var NOTIFY_PAUSED:true --var NOTIFY_LINK_SECRET:changes-video-secret \
  --var COMPANION_LOCAL_TEST_MODE:true --var "COMPANION_LOCAL_PUSH_MOCK:http://127.0.0.1:$P_PUSH" \
  >"$SCRATCH/worker.log" 2>&1 & PIDS+=("$!")
wait_for "$BASE/" "wrangler dev"

status=0
node scripts/changes-video.mjs "$BASE" "$MOCK" "$OUT" "$KEYS_FILE" "$SCRATCH/digest/digest-email.html" || status=1
[ "$status" -eq 0 ] || { echo "--- worker log (tail) ---"; tail -40 "$SCRATCH/worker.log"; }
exit "$status"
