#!/usr/bin/env bash
# Runs the regenOS-hosting, RSVP, newsletter and funnel e2e scripts hermetically,
# against a local wrangler dev + the mock AppView (scripts/regenos-mock.mjs) —
# never scenius.social — and the mock Resend API (scripts/resend-mock.mjs) —
# never a real inbox. Used by .github/workflows/deploy-worker.yml as a gate
# before deploy, and safe to run the same way on a laptop.
#
# Additional coverage: the "wrong/missing service token"
# checks each script's usage header describes as optional
# (E2E_BAD_TOKEN_URL / E2E_NO_TOKEN_URL / the 4th proposals-e2e arg) are all
# exercised here too, since they need nothing but a second wrangler dev
# instance with a different var — no real secret involved.
#
# Requires: npm run build already ran (wrangler dev serves dist/), and
# node_modules has playwright's chromium installed.
#
# Usage: bash scripts/ci-e2e.sh

set -euo pipefail
E2E_PORT_OFFSET=${E2E_PORT_OFFSET:-0}
[[ "$E2E_PORT_OFFSET" =~ ^[0-9]+$ ]] || { echo "E2E_PORT_OFFSET must be a nonnegative integer"; exit 2; }
cd "$(dirname "$0")/.."

# A dedicated, wiped-at-start local state dir — never the default
# .wrangler/state. That default persists on disk across runs (D1 rows, KV
# rate-limit counters, ...), which is exactly what bit this script during
# development: repeated local runs shared one clientIp's propose rate-limit
# bucket (worker/src/proposals.ts) and the fourth run got a real 429. A fresh
# dir each run is what CI gets for free from an ephemeral runner; this makes
# a laptop rerun behave the same way.
PWA_SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/pwa-e2e-XXXXXX")"
PERSIST_DIR="$PWA_SCRATCH/state"
export WRANGLER_LOG_PATH="$PWA_SCRATCH/pwa-merge-wrangler.log"
export npm_config_logs_dir="$PWA_SCRATCH/pwa-merge-npm-logs"
E2E_PORT_OFFSET="${E2E_PORT_OFFSET:-0}"
P28229=$(( 28229 + E2E_PORT_OFFSET ))
P28230=$(( 28230 + E2E_PORT_OFFSET ))
P28231=$(( 28231 + E2E_PORT_OFFSET ))
P28232=$(( 28232 + E2E_PORT_OFFSET ))
P28233=$(( 28233 + E2E_PORT_OFFSET ))
P28234=$(( 28234 + E2E_PORT_OFFSET ))
P28235=$(( 28235 + E2E_PORT_OFFSET ))
P28236=$(( 28236 + E2E_PORT_OFFSET ))
P28237=$(( 28237 + E2E_PORT_OFFSET ))
P28238=$(( 28238 + E2E_PORT_OFFSET ))
P28789=$(( 28789 + E2E_PORT_OFFSET ))
P28850=$(( 28850 + E2E_PORT_OFFSET ))
P28851=$(( 28851 + E2E_PORT_OFFSET ))
P28852=$(( 28852 + E2E_PORT_OFFSET ))
P28860=$(( 28860 + E2E_PORT_OFFSET ))
P28861=$(( 28861 + E2E_PORT_OFFSET ))
P28870=$(( 28870 + E2E_PORT_OFFSET ))
P28880=$(( 28880 + E2E_PORT_OFFSET ))
P28890=$(( 28890 + E2E_PORT_OFFSET ))
P28895=$(( 28895 + E2E_PORT_OFFSET ))
P28944=$(( 28944 + E2E_PORT_OFFSET ))
P28946=$(( 28946 + E2E_PORT_OFFSET ))
P28948=$(( 28948 + E2E_PORT_OFFSET ))
P28950=$(( 28950 + E2E_PORT_OFFSET ))
P28952=$(( 28952 + E2E_PORT_OFFSET ))
P28962=$(( 28962 + E2E_PORT_OFFSET ))
PWA_WORKER_PORT="${PWA_WORKER_PORT:-8898}"
PWA_MOCK_PORT="${PWA_MOCK_PORT:-10048}"
PWA_PUSH_PORT="${PWA_PUSH_PORT:-10049}"
PWA_INSPECTOR_PORT="${PWA_INSPECTOR_PORT:-19298}"
WRANGLER_LOCAL_ARGS=(--persist-to "$PERSIST_DIR")

SESSION_TOKEN="ci-e2e-$(date +%s)-$$"
SESSION_HASH=$(node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$SESSION_TOKEN")

PIDS=()
cleanup() {
  local pid
  for pid in "${PIDS[@]:-}"; do
    # Each local server has its own session, including Wrangler's workerd
    # children. Killing only npm's wrapper leaves D1 open across lanes.
    kill -TERM -- "-$pid" >/dev/null 2>&1 || true
  done
  wait >/dev/null 2>&1 || true
}
finish() {
  cleanup
  rm -f "$PWA_SCRATCH/pwa-merge-push-keys.json"
}
trap finish EXIT

# --- helpers ----------------------------------------------------------------

wait_for() {
  local url="$1" label="$2" tries=60
  while ! curl -s -o /dev/null "$url" 2>/dev/null; do
    tries=$((tries - 1))
    if [ "$tries" -le 0 ]; then
      echo "::error::$label never became ready at $url"
      return 1
    fi
    sleep 1
  done
}

start_mock() {
  local port="$1" logfile="$2"
  PORT="$port" setsid node scripts/regenos-mock.mjs >"$logfile" 2>&1 &
  PIDS+=("$!")
  wait_for "http://127.0.0.1:$port/xrpc/social.scenius.getEvents" "regenOS mock on :$port"
}

# $1 worker port, $2 inspector port, $3 logfile, remaining args: --var flags
start_worker() {
  local port="$1" inspector="$2" logfile="$3"
  shift 3
  setsid node node_modules/wrangler/bin/wrangler.js dev --port "$port" --inspector-port "$inspector" "${WRANGLER_LOCAL_ARGS[@]}" "$@" >"$logfile" 2>&1 &
  PIDS+=("$!")
  wait_for "http://127.0.0.1:$port/" "wrangler dev on :$port"
}

seed_d1_and_kv() {
  npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
  npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --command \
    "INSERT INTO admins (email, name, added_by, created_at) VALUES ('ci-e2e@cohere.test','CI E2E','ci', strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(email) DO NOTHING" >/dev/null
  npx wrangler kv key put --binding COHERE_AUTH --local "${WRANGLER_LOCAL_ARGS[@]}" "session:$SESSION_HASH" \
    '{"email":"ci-e2e@cohere.test","name":"CI E2E","createdAt":"2026-01-01T00:00:00Z"}' >/dev/null
}

fail=0

# --- 1. regenos-e2e.mjs: the sign-in + on-site hosting lane ----------------
echo "::group::regenos-e2e (sign-in lane)"
start_mock ${P28944} "$PWA_SCRATCH/pwa-merge-mock-1.log"
start_worker ${P28789} ${P28229} "$PWA_SCRATCH/pwa-merge-worker-1.log" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28944} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/home-registration-e2e.mjs http://127.0.0.1:${P28789}; then
  fail=1
fi
if ! node scripts/share-e2e.mjs http://127.0.0.1:${P28789}; then
  fail=1
fi
if ! node scripts/regenos-e2e.mjs http://127.0.0.1:${P28789}; then
  tail -150 "$PWA_SCRATCH/pwa-merge-worker-1.log"
  tail -80 "$PWA_SCRATCH/pwa-merge-mock-1.log"
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 2. admin-events-e2e.mjs: the organizer Events + Access tabs -----------
echo "::group::admin-events-e2e (organizer calendar + access lane)"
seed_d1_and_kv
start_mock ${P28950} "$PWA_SCRATCH/pwa-merge-mock-2.log"
start_worker ${P28850} ${P28230} "$PWA_SCRATCH/pwa-merge-worker-2-main.log" \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28950} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
start_worker ${P28851} ${P28231} "$PWA_SCRATCH/pwa-merge-worker-2-bad.log" \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28950} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:bad-token
start_worker ${P28852} ${P28232} "$PWA_SCRATCH/pwa-merge-worker-2-none.log" \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28950} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! E2E_BAD_TOKEN_URL=http://127.0.0.1:${P28851} E2E_NO_TOKEN_URL=http://127.0.0.1:${P28852} \
    node scripts/admin-events-e2e.mjs http://127.0.0.1:${P28850} "$SESSION_TOKEN" http://127.0.0.1:${P28950}; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 3. proposals-e2e.mjs: the accountless propose + approval lane ---------
echo "::group::proposals-e2e (propose + approval lane)"
start_mock ${P28946} "$PWA_SCRATCH/pwa-merge-mock-3.log"
start_worker ${P28860} ${P28233} "$PWA_SCRATCH/pwa-merge-worker-3-main.log" \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28946} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
start_worker ${P28861} ${P28234} "$PWA_SCRATCH/pwa-merge-worker-3-none.log" \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28946} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/proposals-e2e.mjs http://127.0.0.1:${P28860} "$SESSION_TOKEN" http://127.0.0.1:${P28946} http://127.0.0.1:${P28861}; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 4. rsvp-e2e.mjs: email RSVP, admin list, reminder cron, cancel -------
# --test-scheduled exposes /cdn-cgi/local/scheduled; local send_email only
# writes .eml files, so nothing is ever delivered. Explicitly unpause this
# lane to keep testing reminder delivery while deployed reminders are paused.
echo "::group::rsvp-e2e (email RSVP + reminder cron lane)"
start_mock ${P28948} "$PWA_SCRATCH/pwa-merge-mock-4.log"
start_worker ${P28870} ${P28235} "$PWA_SCRATCH/pwa-merge-worker-4.log" --test-scheduled \
  --var RSVP_REMINDERS_PAUSED:false \
  --var REGENOS_LOGIN_ENABLED:false \
  --var REGENOS_SERVICE_TOKEN:mock-token \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28948} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/rsvp-e2e.mjs http://127.0.0.1:${P28870} "$SESSION_TOKEN" http://127.0.0.1:${P28948}; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 5. newsletter-e2e.mjs: Beehiiv import, send safeguards, cron send -----
# RESEND_API_BASE points at scripts/resend-mock.mjs, so no real mail is sent;
# PUBLIC_BASE_URL makes the unsubscribe links point back at this local Worker.
echo "::group::newsletter-e2e (Beehiiv import + newsletter send + Resend webhook lane)"
# A fresh throwaway signing key per run, in Resend's whsec_<base64> format;
# the e2e signs its webhooks with it exactly as Resend (Svix) would.
WEBHOOK_SECRET="whsec_$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("base64"))')"
PORT=${P28962} setsid node scripts/resend-mock.mjs >"$PWA_SCRATCH/pwa-merge-mock-5.log" 2>&1 &
PIDS+=("$!")
wait_for "http://127.0.0.1:${P28962}/_messages" "Resend mock on :${P28962}"
start_worker ${P28880} ${P28236} "$PWA_SCRATCH/pwa-merge-worker-5.log" --test-scheduled \
  --var REGENOS_LOGIN_ENABLED:false \
  --var REGENOS_SERVICE_TOKEN:mock-token \
  --var RESEND_API_BASE:http://127.0.0.1:${P28962} \
  --var RESEND_API_KEY:mock-key \
  --var PUBLIC_BASE_URL:http://127.0.0.1:${P28880} \
  --var "RESEND_WEBHOOK_SECRET:$WEBHOOK_SECRET"
if ! E2E_PERSIST_DIR="$PERSIST_DIR" RESEND_WEBHOOK_SECRET="$WEBHOOK_SECRET" node scripts/newsletter-e2e.mjs http://127.0.0.1:${P28880} "$SESSION_TOKEN" http://127.0.0.1:${P28962}; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 6. checkin-e2e.mjs: door check-in at a phone viewport ----------------
# Reuses lane 2's admin + session seed (same --persist-to dir). Check-in sends
# no mail at all; the one email RSVP it seeds goes to local .eml only.
echo "::group::checkin-e2e (door check-in lane)"
seed_d1_and_kv
start_mock ${P28952} "$PWA_SCRATCH/pwa-merge-mock-6.log"
start_worker ${P28890} ${P28237} "$PWA_SCRATCH/pwa-merge-worker-6.log" \
  --var REGENOS_LOGIN_ENABLED:false \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28952} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/checkin-e2e.mjs http://127.0.0.1:${P28890} "$SESSION_TOKEN" http://127.0.0.1:${P28952}; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 7. funnel-e2e.mjs: registration funnel counts, beacon -> admin view --
# Counts only: the lane checks the beacons carry nothing but an event name.
# Reuses the admin + session seed (same --persist-to dir).
echo "::group::funnel-e2e (registration funnel counts lane)"
seed_d1_and_kv
start_worker ${P28895} ${P28238} "$PWA_SCRATCH/pwa-merge-worker-7.log" \
  --var REGENOS_LOGIN_ENABLED:false
if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/funnel-e2e.mjs http://127.0.0.1:${P28895} "$SESSION_TOKEN"; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 8. Companion: real crypto, loopback-only push and mobile browser ---
echo "::group::companion-e2e"
start_mock "$PWA_MOCK_PORT" "$PWA_SCRATCH/pwa-merge-companion-events.log"
PWA_KEYS_FILE="$PWA_SCRATCH/pwa-merge-push-keys.json"
PORT="$PWA_PUSH_PORT" PWA_KEYS_FILE="$PWA_KEYS_FILE" setsid node scripts/pwa-push-mock.mjs >"$PWA_SCRATCH/pwa-merge-push.log" 2>&1 &
PIDS+=("$!")
wait_for "http://127.0.0.1:$PWA_PUSH_PORT/messages" "local push mock"
PWA_PUBLIC_KEY=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).publicKey)' "$PWA_KEYS_FILE")
PWA_PRIVATE_KEY=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).privateKey)' "$PWA_KEYS_FILE")
PWA_DATE=$(node -e 'process.stdout.write(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Denver",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()))')
start_worker "$PWA_WORKER_PORT" "$PWA_INSPECTOR_PORT" "$PWA_SCRATCH/pwa-merge-companion-worker.log" --test-scheduled \
  --var REGENOS_LOGIN_ENABLED:false \
  --var REGENOS_SERVICE_TOKEN:mock-token \
  --var "REGENOS_BASE_URL:http://127.0.0.1:$PWA_MOCK_PORT" \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var "VAPID_PUBLIC_KEY:$PWA_PUBLIC_KEY" --var "VAPID_PRIVATE_KEY:$PWA_PRIVATE_KEY" \
  --var VAPID_SUBJECT:mailto:test@example.test \
  --var COMPANION_PUSH_PAUSED:false \
  --var "COMPANION_LOCAL_PUSH_MOCK:http://127.0.0.1:$PWA_PUSH_PORT" \
  --var "COMPANION_START_DATE:$PWA_DATE" --var "COMPANION_END_DATE:$PWA_DATE"
if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/companion-e2e.mjs "http://127.0.0.1:$PWA_WORKER_PORT" "$SESSION_TOKEN" "http://127.0.0.1:$PWA_PUSH_PORT" "$PWA_KEYS_FILE" "http://127.0.0.1:$PWA_MOCK_PORT"; then
  fail=1
fi
cleanup
PIDS=()
rm -f "$PWA_KEYS_FILE"
unset PWA_PRIVATE_KEY
echo "::endgroup::"
rm -rf "$PERSIST_DIR"

if [ "$fail" -ne 0 ]; then
  echo "::error::one or more hermetic e2e scripts failed — logs are in $PWA_SCRATCH/pwa-merge-*.log"
  exit 1
fi
echo "All hermetic e2e scripts passed."
