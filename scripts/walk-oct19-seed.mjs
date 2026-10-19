// Seeds the Oct 19 walk stack (scripts/walk-oct19-stack.sh): events on Oct 19–22 in the regenOS
// mock, one registrant with no account in local D1, then fires the 8 PM run for Oct 19 so the
// registrant's evening email is on disk. Only ever talks to the local stack.
//
//   node scripts/walk-oct19-seed.mjs <state-dir>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const state = process.argv[2];
if (!state) { console.error("usage: node scripts/walk-oct19-seed.mjs <state-dir>"); process.exit(2); }
const env = Object.fromEntries(readFileSync(`${state}/env`, "utf8").trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)));
const { BASE, MOCK, PERSIST } = env;

// Boulder is UTC-6 in October.
const at = (day, hhmm) => new Date(Date.UTC(2026, 9, Number(day), Number(hhmm.slice(0, 2)) + 6, Number(hhmm.slice(3)))).toISOString();
const EVENTS = [
  ["wk-sit-19", "Morning Sit by the Creek", "19", "07:30", "08:30", "Eben G. Fine Park"],
  ["wk-swap-19", "Seed Swap", "19", "13:00", "15:00", "Boulder Public Library"],
  ["wk-sit-20", "Morning Sit by the Creek", "20", "07:30", "08:30", "Eben G. Fine Park"],
  ["wk-walk-20", "Watershed Walk", "20", "10:00", "12:00", "Boulder Creek Path"],
  ["wk-mend-20", "Mending Circle", "20", "14:00", "16:00", "The Shop at Martin Park"],
  ["wk-potluck-20", "Community Potluck", "20", "18:00", "20:00", "Columbia Cemetery Lawn"],
  ["wk-story-21", "Story Circle", "21", "17:00", "19:00", "Chautauqua Community House"],
  ["wk-market-22", "Free Market", "22", "10:00", "13:00", "Martin Park"],
];
for (const [rkey, name, day, start, end, placeName] of EVENTS) {
  const body = {
    authority: "did:plc:mockscene", rkey, name, startsAt: at(day, start), endsAt: at(day, end),
    description: "Bring a cup and something to share. We meet by the big cottonwood and walk together.",
    mode: "inperson", placeName, locality: "Boulder", region: "CO", attendance: "open",
  };
  const r = await fetch(`${MOCK}/xrpc/social.scenius.createEvent`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mock-token" }, body: JSON.stringify(body) });
  if (!r.ok) { console.error(`createEvent ${rkey}: ${r.status} ${await r.text()}`); process.exit(1); }
}

const sql = (command) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "cohere", "--local", "--persist-to", PERSIST, "--json", "--command", command], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }))[0].results ?? [];
sql(`INSERT OR IGNORE INTO people (id, email, name, subscribed, unsubscribe_token, source, created_at, updated_at)
     VALUES ('walk-reg', 'river.walk@example.test', 'River Walker', 1, 'walk-unsub-token', 'register-2026', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`);
sql(`INSERT OR IGNORE INTO submissions (id, person_id, form_slug, data, created_at, updated_at)
     VALUES ('walk-sub', 'walk-reg', 'register-2026', '{"full_name":"River Walker","email":"river.walk@example.test"}', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`);

// 8 PM Boulder on Oct 19 = 02:00 UTC Oct 20. Three ticks, as the sender spreads the hour.
for (const min of [0, 1, 2]) {
  const t = Date.parse("2026-10-20T02:00:00Z") + min * 60_000;
  const r = await fetch(`${BASE}/cdn-cgi/local/scheduled?cron=${encodeURIComponent("* * * * *")}&time=${t}`);
  if (r.status !== 200) { console.error(`scheduled answered ${r.status}`); process.exit(1); }
}
console.log(JSON.stringify(sql("SELECT * FROM notify_ledger"), null, 1));
