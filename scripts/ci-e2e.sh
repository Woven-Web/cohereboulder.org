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
P28954=$(( 28954 + E2E_PORT_OFFSET ))
P28955=$(( 28955 + E2E_PORT_OFFSET ))
P28956=$(( 28956 + E2E_PORT_OFFSET ))
P28957=$(( 28957 + E2E_PORT_OFFSET ))
P28240=$(( 28240 + E2E_PORT_OFFSET ))
P28958=$(( 28958 + E2E_PORT_OFFSET ))
P28959=$(( 28959 + E2E_PORT_OFFSET ))
P28241=$(( 28241 + E2E_PORT_OFFSET ))
P28960=$(( 28960 + E2E_PORT_OFFSET ))
P28961=$(( 28961 + E2E_PORT_OFFSET ))
P28242=$(( 28242 + E2E_PORT_OFFSET ))
P28239=$(( 28239 + E2E_PORT_OFFSET ))
P28963=$(( 28963 + E2E_PORT_OFFSET ))
P28243=$(( 28243 + E2E_PORT_OFFSET ))
P28244=$(( 28244 + E2E_PORT_OFFSET ))
P28964=$(( 28964 + E2E_PORT_OFFSET ))
P28965=$(( 28965 + E2E_PORT_OFFSET ))
P28966=$(( 28966 + E2E_PORT_OFFSET ))
P28967=$(( 28967 + E2E_PORT_OFFSET ))
P28245=$(( 28245 + E2E_PORT_OFFSET ))
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
# The members Board reads D1 (moderation state) once a member is signed in.
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
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

# --- 7. admin-gate-e2e.mjs: the portal opens for regenOS builders+ only ---
# The retired email-code login is OFF (the production default) on the main
# Worker, so the seeded cohere_session must be refused; a second Worker with
# the flag on proves the rollback path. Waits ~65s for the 60s role cache.
echo "::group::admin-gate-e2e (regenOS role gate)"
seed_d1_and_kv
# Page the roster one member at a time so the gate follows the cursor.
MOCK_ROSTER_PAGE_SIZE=1 start_mock ${P28954} "$PWA_SCRATCH/pwa-merge-mock-7.log"
ADMIN_LOGIN_FLAG=false start_worker $((28900 + E2E_PORT_OFFSET)) $((28238 + E2E_PORT_OFFSET)) "$PWA_SCRATCH/pwa-merge-worker-7-main.log" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28954} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
ADMIN_LOGIN_FLAG=true start_worker $((28901 + E2E_PORT_OFFSET)) $((28239 + E2E_PORT_OFFSET)) "$PWA_SCRATCH/pwa-merge-worker-7-rollback.log" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28954} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token
# The header's Organizer link, and the portal wearing the site's chrome. Runs
# first: the gate script below demotes the mock's builder to test the cache.
if ! node scripts/admin-ui-e2e.mjs http://127.0.0.1:$((28900 + E2E_PORT_OFFSET)); then
  fail=1
fi
if ! node scripts/admin-gate-e2e.mjs http://127.0.0.1:$((28900 + E2E_PORT_OFFSET)) http://127.0.0.1:${P28954} "$SESSION_TOKEN" http://127.0.0.1:$((28901 + E2E_PORT_OFFSET)); then
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
  --var NOTIFY_PAUSED:false \
  --var COMPANION_LOCAL_TEST_MODE:true \
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
# --- 9. myevents-e2e.mjs: "My events" + Your next, from an email RSVP ------
echo "::group::myevents-e2e (My events + Your next lane)"
# Its own state dir: /api/events is edge-cached in the persisted Cache API, and
# an earlier lane's events would otherwise be served here instead of this
# lane's mock.
WRANGLER_LOCAL_ARGS=(--persist-to "$PERSIST_DIR-myevents")
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
start_mock ${P28954} "$PWA_SCRATCH/pwa-merge-mock-9.log"
start_worker ${P28955} ${P28239} "$PWA_SCRATCH/pwa-merge-worker-9.log" \
  --var REGENOS_LOGIN_ENABLED:false \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28954} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/myevents-e2e.mjs http://127.0.0.1:${P28955}; then
  tail -80 "$PWA_SCRATCH/pwa-merge-worker-9.log"
  fail=1
fi
cleanup
PIDS=()
rm -rf "$PERSIST_DIR-myevents"
echo "::endgroup::"

# --- 10. board-e2e.mjs: the members Board, report + admin moderation -------
echo "::group::board-e2e (members Board + moderation lane)"
WRANGLER_LOCAL_ARGS=(--persist-to "$PERSIST_DIR-board")
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --command \
  "INSERT INTO admins (email, name, added_by, created_at) VALUES ('ci-e2e@cohere.test','CI E2E','ci', strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(email) DO NOTHING" >/dev/null
npx wrangler kv key put --binding COHERE_AUTH --local "${WRANGLER_LOCAL_ARGS[@]}" "session:$SESSION_HASH" \
  '{"email":"ci-e2e@cohere.test","name":"CI E2E","createdAt":"2026-01-01T00:00:00Z"}' >/dev/null
start_mock ${P28956} "$PWA_SCRATCH/pwa-merge-mock-10.log"
start_worker ${P28957} ${P28240} "$PWA_SCRATCH/pwa-merge-worker-10.log" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28956} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/board-e2e.mjs http://127.0.0.1:${P28957} "$SESSION_TOKEN"; then
  tail -80 "$PWA_SCRATCH/pwa-merge-worker-10.log"
  fail=1
fi
cleanup
PIDS=()
rm -rf "$PERSIST_DIR-board"
echo "::endgroup::"

# --- 11. people-e2e.mjs: the members directory + profiles ------------------
echo "::group::people-e2e (members directory + profile lane)"
# The Board's moderation filter and RSVP settings read D1.
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
start_mock ${P28958} "$PWA_SCRATCH/pwa-merge-mock-11.log"
start_worker ${P28959} ${P28241} "$PWA_SCRATCH/pwa-merge-worker-11.log" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28958} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/people-e2e.mjs http://127.0.0.1:${P28959}; then
  tail -80 "$PWA_SCRATCH/pwa-merge-worker-11.log"
  fail=1
fi
cleanup
PIDS=()
rm -rf "$PERSIST_DIR-board"
echo "::endgroup::"

# --- 12. rsvp-visibility-e2e.mjs: "Who sees my RSVPs" ----------------------
# Needs D1 (the setting) and the email RSVP table, so it loads the schema into
# its own state dir like lane 10. No mail is delivered: send_email is local.
echo "::group::rsvp-visibility-e2e (who sees my RSVPs lane)"
WRANGLER_LOCAL_ARGS=(--persist-to "$PERSIST_DIR-rsvpvis")
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
start_mock ${P28960} "$PWA_SCRATCH/pwa-merge-mock-12.log"
start_worker ${P28961} ${P28242} "$PWA_SCRATCH/pwa-merge-worker-12.log" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28960} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/rsvp-visibility-e2e.mjs http://127.0.0.1:${P28961}; then
  tail -80 "$PWA_SCRATCH/pwa-merge-worker-12.log"
  fail=1
fi
cleanup
PIDS=()
rm -rf "$PERSIST_DIR-rsvpvis"
echo "::endgroup::"

# --- 13. look-e2e.mjs: ?look=almanac public site + ?trail=row ---------------
# The comparison switches (T-113). The form row loads BEFORE the Worker starts
# (a wrangler d1 write against a running dev server can take it down). Regenos
# login stays off: nothing here talks to a regenOS.
echo "::group::look-e2e (Almanac public look + trail variants lane)"
WRANGLER_LOCAL_ARGS=(--persist-to "$PERSIST_DIR-look")
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/migrations/0002_register_2026_refresh.sql >/dev/null
start_worker ${P28963} ${P28243} "$PWA_SCRATCH/pwa-merge-worker-13.log" \
  --var REGENOS_LOGIN_ENABLED:false
if ! node scripts/look-e2e.mjs http://127.0.0.1:${P28963} ${LOOK_SHOTS:-}; then
  tail -80 "$PWA_SCRATCH/pwa-merge-worker-13.log"
  fail=1
fi
cleanup
PIDS=()
rm -rf "$PERSIST_DIR-look"
echo "::endgroup::"

# --- 14. ecology-e2e.mjs: ?look=ecology across the site and the app screens --
# Same rule as lane 13: the form row and the day's companion content load BEFORE
# the Worker starts. The regenOS mock (fresh) feeds the Board and the day picker.
echo "::group::ecology-e2e (Ecology look lane)"
WRANGLER_LOCAL_ARGS=(--persist-to "$PERSIST_DIR-ecology")
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/migrations/0002_register_2026_refresh.sql >/dev/null
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=scripts/fixtures/look-companion.sql >/dev/null
start_mock ${P28964} "$PWA_SCRATCH/pwa-merge-mock-14.log"
start_worker ${P28965} ${P28244} "$PWA_SCRATCH/pwa-merge-worker-14.log" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28964} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
if ! node scripts/ecology-e2e.mjs http://127.0.0.1:${P28965} http://127.0.0.1:${P28964} ${LOOK_SHOTS:+$LOOK_SHOTS/ecology}; then
  tail -80 "$PWA_SCRATCH/pwa-merge-worker-14.log"
  fail=1
fi
cleanup
PIDS=()
rm -rf "$PERSIST_DIR-ecology"
echo "::endgroup::"
# --- 16. register-signin-e2e.mjs: registration and sign-in together (T-138) --
# Seeds two registrations BEFORE the Worker starts (a wrangler d1 write against
# a running dev server can take it down). Signed out never overwrites; signed in
# edits your own; AUTO_MEMBER_ON_SIGNIN on, against a mock whose setMembership
# may add a new member. The form row has no confirmation mail, and beginSignup
# goes to the mock.
echo "::group::register-signin-e2e (registration + sign-in lane)"
WRANGLER_LOCAL_ARGS=(--persist-to "$PERSIST_DIR-regsignin")
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/migrations/0002_register_2026_refresh.sql >/dev/null
npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --command \
  "INSERT INTO people (id, email, name, phone, orgs, subscribed, unsubscribe_token, source, created_at, updated_at) VALUES
     ('p-ana','ana@cohere.test','Ana Original','555-0100','Garden Co',1,'tok-ana','form:register-2026','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z'),
     ('p-reg','reg@cohere.test','Reg Original',NULL,NULL,1,'tok-reg','form:register-2026','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
   INSERT INTO submissions (id, person_id, form_slug, event, data, created_at, updated_at) VALUES
     ('s-ana','p-ana','register-2026','october2026','{\"how_did_you_hear\":\"a flyer\"}','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z'),
     ('s-reg','p-reg','register-2026','october2026','{\"how_did_you_hear\":\"the radio\",\"attending_invocation\":\"Yes\"}','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
   INSERT INTO forms (slug, title, fields, active, created_at, updated_at) VALUES
     ('map-suggestion','Suggest an addition','[]',1,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');" >/dev/null
MOCK_SETMEMBERSHIP_ADDS=1 start_mock ${P28966} "$PWA_SCRATCH/pwa-merge-mock-16.log"
start_worker ${P28967} ${P28245} "$PWA_SCRATCH/pwa-merge-worker-16.log" \
  --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:${P28966} \
  --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
  --var REGENOS_SERVICE_TOKEN:mock-token \
  --var AUTO_MEMBER_ON_SIGNIN:true
if ! E2E_PERSIST_DIR="$PERSIST_DIR-regsignin" node scripts/register-signin-e2e.mjs http://127.0.0.1:${P28967} http://127.0.0.1:${P28966}; then
  tail -80 "$PWA_SCRATCH/pwa-merge-worker-16.log"
  fail=1
fi
cleanup
PIDS=()
rm -rf "$PERSIST_DIR-regsignin"
echo "::endgroup::"

# --- 17. board-gate-e2e.mjs: registered non-member at the Board gate --------
# Same seeds as lane 16. "grants": the mock lets setMembership add people, so
# AUTO_MEMBER_ON_SIGNIN lets the registrant in. "fails": it refuses, so the gate
# must say "registered, being set up" with no Register button. Fresh mock each.
echo "::group::board-gate-e2e (registered non-member lane)"
for gate_mode in grants fails; do
  WRANGLER_LOCAL_ARGS=(--persist-to "$PERSIST_DIR-boardgate")
  rm -rf "$PERSIST_DIR-boardgate"
  npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/schema.sql >/dev/null
  npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --file=worker/migrations/0002_register_2026_refresh.sql >/dev/null
  npx wrangler d1 execute cohere --local "${WRANGLER_LOCAL_ARGS[@]}" --command \
    "INSERT INTO people (id, email, name, phone, orgs, subscribed, unsubscribe_token, source, created_at, updated_at) VALUES
       ('p-reg','reg@cohere.test','Reg Original',NULL,NULL,1,'tok-reg','form:register-2026','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
     INSERT INTO submissions (id, person_id, form_slug, event, data, created_at, updated_at) VALUES
       ('s-reg','p-reg','register-2026','october2026','{\"how_did_you_hear\":\"the radio\"}','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');" >/dev/null
  if [ "$gate_mode" = grants ]; then export MOCK_SETMEMBERSHIP_ADDS=1; else unset MOCK_SETMEMBERSHIP_ADDS; fi
  start_mock ${P28966} "$PWA_SCRATCH/pwa-merge-mock-17-$gate_mode.log"
  start_worker ${P28967} ${P28245} "$PWA_SCRATCH/pwa-merge-worker-17-$gate_mode.log" \
    --var REGENOS_LOGIN_ENABLED:true \
    --var REGENOS_BASE_URL:http://127.0.0.1:${P28966} \
    --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
    --var REGENOS_SERVICE_TOKEN:mock-token \
    --var AUTO_MEMBER_ON_SIGNIN:true
  if ! node scripts/board-gate-e2e.mjs http://127.0.0.1:${P28967} http://127.0.0.1:${P28966} "$gate_mode"; then
    tail -80 "$PWA_SCRATCH/pwa-merge-worker-17-$gate_mode.log"
    fail=1
  fi
  cleanup
  PIDS=()
done
unset MOCK_SETMEMBERSHIP_ADDS
rm -rf "$PERSIST_DIR-boardgate"
echo "::endgroup::"

# --- 15. notify-e2e: notifications + Harvest ---------------------------------
# Self-contained (its own scratch, servers and ports): see scripts/notify-e2e.sh.
echo "::group::notify-e2e (notifications + harvest lane)"
if ! bash scripts/notify-e2e.sh; then
  fail=1
fi
echo "::endgroup::"

rm -rf "$PERSIST_DIR"

if [ "$fail" -ne 0 ]; then
  echo "::error::one or more hermetic e2e scripts failed — logs are in $PWA_SCRATCH/pwa-merge-*.log"
  exit 1
fi
echo "All hermetic e2e scripts passed."
