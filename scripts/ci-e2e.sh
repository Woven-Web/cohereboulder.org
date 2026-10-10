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
# Give each invocation its own directory: concurrent worktrees/runners must
# not wipe another runner's sessions or D1 while its browser is still using it.
PERSIST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/cohere-ci-e2e.XXXXXX")
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
  PORT="$port" MOCK_ROSTER_PAGE_SIZE="${MOCK_ROSTER_PAGE_SIZE:-0}" setsid node scripts/regenos-mock.mjs >"$logfile" 2>&1 &
  PIDS+=("$!")
  wait_for "http://127.0.0.1:$port/xrpc/social.scenius.getEvents" "regenOS mock on :$port"
}

# $1 worker port, $2 inspector port, $3 logfile, remaining args: --var flags.
# ADMIN_EMAIL_LOGIN defaults to "true" here: lanes 2-6 seed a cohere_session
# in KV rather than signing in, and those lanes test the calendar, RSVP,
# newsletter and check-in features, not the gate. Lane 7 tests the gate itself
# and starts its main Worker with ADMIN_LOGIN_FLAG=false (the production default).
start_worker() {
  local port="$1" inspector="$2" logfile="$3"
  shift 3
  setsid node node_modules/wrangler/bin/wrangler.js dev --port "$port" --inspector-port "$inspector" "${WRANGLER_LOCAL_ARGS[@]}" \
    --var "ADMIN_EMAIL_LOGIN:${ADMIN_LOGIN_FLAG:-true}" "$@" >"$logfile" 2>&1 &
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
start_mock $((28944 + E2E_PORT_OFFSET)) /tmp/ci-e2e-mock-1.log
start_worker $((28789 + E2E_PORT_OFFSET)) $((28229 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-1.log \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28944 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/home-registration-e2e.mjs http://127.0.0.1:$((28789 + E2E_PORT_OFFSET)); then
  fail=1
fi
if ! node scripts/share-e2e.mjs http://127.0.0.1:$((28789 + E2E_PORT_OFFSET)); then
  fail=1
fi
if ! node scripts/regenos-e2e.mjs http://127.0.0.1:$((28789 + E2E_PORT_OFFSET)); then
  tail -150 /tmp/ci-e2e-worker-1.log
  tail -80 /tmp/ci-e2e-mock-1.log
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 2. admin-events-e2e.mjs: the organizer Events + Access tabs -----------
echo "::group::admin-events-e2e (organizer calendar + access lane)"
seed_d1_and_kv
start_mock $((28950 + E2E_PORT_OFFSET)) /tmp/ci-e2e-mock-2.log
start_worker $((28850 + E2E_PORT_OFFSET)) $((28230 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-2-main.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28950 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
start_worker $((28851 + E2E_PORT_OFFSET)) $((28231 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-2-bad.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28950 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:bad-token
start_worker $((28852 + E2E_PORT_OFFSET)) $((28232 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-2-none.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28950 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! E2E_BAD_TOKEN_URL=http://127.0.0.1:$((28851 + E2E_PORT_OFFSET)) E2E_NO_TOKEN_URL=http://127.0.0.1:$((28852 + E2E_PORT_OFFSET)) \
    node scripts/admin-events-e2e.mjs http://127.0.0.1:$((28850 + E2E_PORT_OFFSET)) "$SESSION_TOKEN" http://127.0.0.1:$((28950 + E2E_PORT_OFFSET)); then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 3. proposals-e2e.mjs: the accountless propose + approval lane ---------
echo "::group::proposals-e2e (propose + approval lane)"
start_mock $((28946 + E2E_PORT_OFFSET)) /tmp/ci-e2e-mock-3.log
start_worker $((28860 + E2E_PORT_OFFSET)) $((28233 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-3-main.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28946 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
start_worker $((28861 + E2E_PORT_OFFSET)) $((28234 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-3-none.log \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28946 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/proposals-e2e.mjs http://127.0.0.1:$((28860 + E2E_PORT_OFFSET)) "$SESSION_TOKEN" http://127.0.0.1:$((28946 + E2E_PORT_OFFSET)) http://127.0.0.1:$((28861 + E2E_PORT_OFFSET)); then
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
start_mock $((28948 + E2E_PORT_OFFSET)) /tmp/ci-e2e-mock-4.log
start_worker $((28870 + E2E_PORT_OFFSET)) $((28235 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-4.log --test-scheduled \
  --var RSVP_REMINDERS_PAUSED:false \
  --var REGENOS_LOGIN_ENABLED:false \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28948 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/rsvp-e2e.mjs http://127.0.0.1:$((28870 + E2E_PORT_OFFSET)) "$SESSION_TOKEN" http://127.0.0.1:$((28948 + E2E_PORT_OFFSET)); then
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
PORT=$((28962 + E2E_PORT_OFFSET)) setsid node scripts/resend-mock.mjs >/tmp/ci-e2e-mock-5.log 2>&1 &
PIDS+=("$!")
wait_for "http://127.0.0.1:$((28962 + E2E_PORT_OFFSET))/_messages" "Resend mock on :$((28962 + E2E_PORT_OFFSET))"
start_worker $((28880 + E2E_PORT_OFFSET)) $((28236 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-5.log --test-scheduled \
  --var REGENOS_LOGIN_ENABLED:false \
  --var RESEND_API_BASE:http://127.0.0.1:$((28962 + E2E_PORT_OFFSET)) \
  --var RESEND_API_KEY:mock-key \
  --var PUBLIC_BASE_URL:http://127.0.0.1:$((28880 + E2E_PORT_OFFSET)) \
  --var "RESEND_WEBHOOK_SECRET:$WEBHOOK_SECRET"
if ! E2E_PERSIST_DIR="$PERSIST_DIR" RESEND_WEBHOOK_SECRET="$WEBHOOK_SECRET" node scripts/newsletter-e2e.mjs http://127.0.0.1:$((28880 + E2E_PORT_OFFSET)) "$SESSION_TOKEN" http://127.0.0.1:$((28962 + E2E_PORT_OFFSET)); then
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
start_mock $((28952 + E2E_PORT_OFFSET)) /tmp/ci-e2e-mock-6.log
start_worker $((28890 + E2E_PORT_OFFSET)) $((28237 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-6.log \
  --var REGENOS_LOGIN_ENABLED:false \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28952 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/checkin-e2e.mjs http://127.0.0.1:$((28890 + E2E_PORT_OFFSET)) "$SESSION_TOKEN" http://127.0.0.1:$((28952 + E2E_PORT_OFFSET)); then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 7. admin-gate-e2e.mjs: the portal opens for regenOS builders+ only ---
# The retired email-code login is OFF (the production default) on the main
# Worker, so the seeded cohere_session must be refused; a second Worker with
# the flag on proves the rollback path. Waits ~65s for the 60s role cache.
echo "::group::admin-gate-e2e (regenOS role gate)"
seed_d1_and_kv
# Page the roster one member at a time so the gate follows the cursor.
MOCK_ROSTER_PAGE_SIZE=1 start_mock $((28954 + E2E_PORT_OFFSET)) /tmp/ci-e2e-mock-7.log
ADMIN_LOGIN_FLAG=false start_worker $((28900 + E2E_PORT_OFFSET)) $((28238 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-7-main.log \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28954 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
ADMIN_LOGIN_FLAG=true start_worker $((28901 + E2E_PORT_OFFSET)) $((28239 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-7-rollback.log \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:$((28954 + E2E_PORT_OFFSET)) \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
# The header's Organizer link, and the portal wearing the site's chrome. Runs
# first: the gate script below demotes the mock's builder to test the cache.
if ! node scripts/admin-ui-e2e.mjs http://127.0.0.1:$((28900 + E2E_PORT_OFFSET)); then
  fail=1
fi
if ! node scripts/admin-gate-e2e.mjs http://127.0.0.1:$((28900 + E2E_PORT_OFFSET)) http://127.0.0.1:$((28954 + E2E_PORT_OFFSET)) "$SESSION_TOKEN" http://127.0.0.1:$((28901 + E2E_PORT_OFFSET)); then
  fail=1
fi
cleanup
PIDS=()
echo "::endgroup::"

# --- 8. funnel-e2e.mjs: registration funnel counts, beacon -> admin view --
# Counts only: the lane checks the beacons carry nothing but an event name.
# Reuses the admin + session seed (same --persist-to dir).
echo "::group::funnel-e2e (registration funnel counts lane)"
seed_d1_and_kv
start_worker $((28895 + E2E_PORT_OFFSET)) $((28240 + E2E_PORT_OFFSET)) /tmp/ci-e2e-worker-8.log \
  --var REGENOS_LOGIN_ENABLED:false
if ! E2E_PERSIST_DIR="$PERSIST_DIR" node scripts/funnel-e2e.mjs http://127.0.0.1:$((28895 + E2E_PORT_OFFSET)) "$SESSION_TOKEN"; then
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
