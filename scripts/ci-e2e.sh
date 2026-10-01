#!/usr/bin/env bash
# Runs the regenOS-hosting and RSVP e2e scripts hermetically, against a local
# wrangler dev + the mock AppView (scripts/regenos-mock.mjs) — never
# scenius.social. Used by .github/workflows/deploy-worker.yml as a gate
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
cd "$(dirname "$0")/.."

# A dedicated, wiped-at-start local state dir — never the default
# .wrangler/state. That default persists on disk across runs (D1 rows, KV
# rate-limit counters, ...), which is exactly what bit this script during
# development: repeated local runs shared one clientIp's propose rate-limit
# bucket (worker/src/proposals.ts) and the fourth run got a real 429. A fresh
# dir each run is what CI gets for free from an ephemeral runner; this makes
# a laptop rerun behave the same way.
PERSIST_DIR="$(pwd)/.wrangler-ci-e2e-state"
rm -rf "$PERSIST_DIR"
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
trap cleanup EXIT

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
start_mock 28944 /tmp/ci-e2e-mock-1.log
start_worker 28789 28229 /tmp/ci-e2e-worker-1.log \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:28944 \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/share-e2e.mjs http://127.0.0.1:28789; then
  fail=1
fi
if ! node scripts/regenos-e2e.mjs http://127.0.0.1:28789; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 2. admin-events-e2e.mjs: the organizer Events + Access tabs -----------
echo "::group::admin-events-e2e (organizer calendar + access lane)"
seed_d1_and_kv
start_mock 28950 /tmp/ci-e2e-mock-2.log
start_worker 28850 28230 /tmp/ci-e2e-worker-2-main.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:28950 \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
start_worker 28851 28231 /tmp/ci-e2e-worker-2-bad.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:28950 \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:bad-token
start_worker 28852 28232 /tmp/ci-e2e-worker-2-none.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:28950 \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! E2E_BAD_TOKEN_URL=http://127.0.0.1:28851 E2E_NO_TOKEN_URL=http://127.0.0.1:28852 \
    node scripts/admin-events-e2e.mjs http://127.0.0.1:28850 "$SESSION_TOKEN" http://127.0.0.1:28950; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 3. proposals-e2e.mjs: the accountless propose + approval lane ---------
echo "::group::proposals-e2e (propose + approval lane)"
start_mock 28946 /tmp/ci-e2e-mock-3.log
start_worker 28860 28233 /tmp/ci-e2e-worker-3-main.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:28946 \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
start_worker 28861 28234 /tmp/ci-e2e-worker-3-none.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:28946 \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/proposals-e2e.mjs http://127.0.0.1:28860 "$SESSION_TOKEN" http://127.0.0.1:28946 http://127.0.0.1:28861; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 4. rsvp-e2e.mjs: email RSVP, admin list, reminder cron, cancel -------
# --test-scheduled exposes /cdn-cgi/local/scheduled; local send_email only
# writes .eml files, so nothing is ever delivered.
echo "::group::rsvp-e2e (email RSVP + reminder cron lane)"
start_mock 28948 /tmp/ci-e2e-mock-4.log
start_worker 28870 28235 /tmp/ci-e2e-worker-4.log --test-scheduled \
  --var REGENOS_LOGIN_ENABLED:false \
  --var REGENOS_BASE_URL:http://127.0.0.1:28948 \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/rsvp-e2e.mjs http://127.0.0.1:28870 "$SESSION_TOKEN" http://127.0.0.1:28948; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 5. checkin-e2e.mjs: door check-in at a phone viewport ----------------
# Reuses lane 2's admin + session seed (same --persist-to dir). Check-in sends
# no mail at all; the one email RSVP it seeds goes to local .eml only.
echo "::group::checkin-e2e (door check-in lane)"
seed_d1_and_kv
start_mock 28952 /tmp/ci-e2e-mock-5.log
start_worker 28880 28236 /tmp/ci-e2e-worker-5.log \
  --var REGENOS_LOGIN_ENABLED:false \
  --var REGENOS_BASE_URL:http://127.0.0.1:28952 \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/checkin-e2e.mjs http://127.0.0.1:28880 "$SESSION_TOKEN" http://127.0.0.1:28952; then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

rm -rf "$PERSIST_DIR"

if [ "$fail" -ne 0 ]; then
  echo "::error::one or more hermetic e2e scripts failed — logs are in /tmp/ci-e2e-*.log"
  exit 1
fi
echo "All hermetic e2e scripts passed."
