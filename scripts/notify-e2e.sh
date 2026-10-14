#!/usr/bin/env bash
# Runs scripts/notify-e2e.mjs hermetically: a fresh local D1/KV, the regenOS mock
# (MOCK_NOTIFY=1), the loopback push receiver, and `wrangler dev` with every
# notification switch on. Nothing leaves this machine: the push mock decrypts
# what the Worker sends, the local send_email binding writes files, and no
# production or scenius.social endpoint is contacted.
#
# Used as lane 13 of scripts/ci-e2e.sh, and safe to run alone:
#   npm run build && bash scripts/notify-e2e.sh [shots-dir]
#
# It only ever stops processes it started (their own process groups).

set -euo pipefail
cd "$(dirname "$0")/.."
SHOTS_DIR="${1:-}"
OFFSET=${E2E_PORT_OFFSET:-0}
P_WORKER=$(( 28970 + OFFSET )); P_INSPECT=$(( 28971 + OFFSET )); P_MOCK=$(( 28972 + OFFSET )); P_PUSH=$(( 28973 + OFFSET ))

SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/pwa-e2e-notify-XXXXXX")"
PERSIST_DIR="$SCRATCH/state"
export WRANGLER_LOG_PATH="$SCRATCH/wrangler.log"
export npm_config_logs_dir="$SCRATCH/npm-logs"
PERSIST=(--persist-to "$PERSIST_DIR")
PIDS=()
stop() { local pid; for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill -TERM -- "-$pid" >/dev/null 2>&1 || true; done; wait >/dev/null 2>&1 || true; }
trap 'stop; rm -rf "$SCRATCH"' EXIT

wait_for() { local tries=60; while ! curl -s -o /dev/null "$1" 2>/dev/null; do tries=$((tries - 1)); [ "$tries" -le 0 ] && { echo "::error::$2 never became ready"; exit 1; }; sleep 1; done; }

SESSION_TOKEN="notify-e2e-$(date +%s)-$$"
SESSION_HASH=$(node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$SESSION_TOKEN")
KEYS_FILE="$SCRATCH/push-keys.json"
export NOTIFY_LINK_SECRET="e2e-link-secret-$$"

npx wrangler d1 execute cohere --local "${PERSIST[@]}" --file=worker/schema.sql >/dev/null
npx wrangler d1 execute cohere --local "${PERSIST[@]}" --command \
  "INSERT INTO admins (email, name, added_by, created_at) VALUES ('notify-e2e@cohere.test','Notify E2E','ci', strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(email) DO NOTHING" >/dev/null
npx wrangler kv key put --binding COHERE_AUTH --local "${PERSIST[@]}" "session:$SESSION_HASH" \
  '{"email":"notify-e2e@cohere.test","name":"Notify E2E","createdAt":"2026-01-01T00:00:00Z"}' >/dev/null

MOCK_NOTIFY=1 PORT="$P_MOCK" setsid node scripts/regenos-mock.mjs >"$SCRATCH/mock.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_MOCK/xrpc/social.scenius.getEvents" "regenOS mock"
PORT="$P_PUSH" PWA_KEYS_FILE="$KEYS_FILE" setsid node scripts/pwa-push-mock.mjs >"$SCRATCH/push.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_PUSH/messages" "push mock"
PUBLIC_KEY=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).publicKey)' "$KEYS_FILE")
PRIVATE_KEY=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).privateKey)' "$KEYS_FILE")
START=$(node -e 'process.stdout.write(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Denver"}).format(new Date(Date.now()-3*864e5)))')
END=$(node -e 'process.stdout.write(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Denver"}).format(new Date(Date.now()+5*864e5)))')

setsid node node_modules/wrangler/bin/wrangler.js dev --port "$P_WORKER" --inspector-port "$P_INSPECT" "${PERSIST[@]}" --test-scheduled \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_SERVICE_TOKEN:mock-token \
  --var "REGENOS_BASE_URL:http://127.0.0.1:$P_MOCK" \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var "VAPID_PUBLIC_KEY:$PUBLIC_KEY" --var "VAPID_PRIVATE_KEY:$PRIVATE_KEY" --var VAPID_SUBJECT:mailto:test@example.test \
  --var COMPANION_PUSH_PAUSED:false --var NOTIFY_PAUSED:false --var ADMIN_EMAIL_LOGIN:true \
  --var "NOTIFY_LINK_SECRET:$NOTIFY_LINK_SECRET" \
  --var COMPANION_LOCAL_TEST_MODE:true --var "COMPANION_LOCAL_PUSH_MOCK:http://127.0.0.1:$P_PUSH" \
  --var "COMPANION_START_DATE:$START" --var "COMPANION_END_DATE:$END" \
  >"$SCRATCH/worker.log" 2>&1 & PIDS+=("$!")
wait_for "http://127.0.0.1:$P_WORKER/" "wrangler dev"

if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/notify-e2e.mjs "http://127.0.0.1:$P_WORKER" "$SESSION_TOKEN" "http://127.0.0.1:$P_PUSH" "$KEYS_FILE" ${SHOTS_DIR:+"$SHOTS_DIR"}; then
  echo "--- worker log (tail) ---"; tail -60 "$SCRATCH/worker.log"
  exit 1
fi
