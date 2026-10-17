// Reads what the guide needs from the live site so the local copy looks like the real app: the public
// calendar (with the recent past), its event photos, the registration form and today's practice.
// GET only, public endpoints only; it writes files into <out-dir> for scripts/guide-capture.sh to load
// into LOCAL stores. Events named TEST are left out.
//
//   node scripts/guide-fetch-live.mjs https://cohereboulder.org <out-dir>
import { mkdir, writeFile } from "node:fs/promises";

const [live, out] = process.argv.slice(2);
if (!live || !out) { console.error("usage: node scripts/guide-fetch-live.mjs <live-url> <out-dir>"); process.exit(2); }
await mkdir(`${out}/img`, { recursive: true });
const get = async (path) => {
  const res = await fetch(`${live}${path}`, { method: "GET" });
  if (!res.ok) throw new Error(`GET ${path} answered ${res.status}`);
  return res;
};
const sql = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const MOCK_DID = "did:plc:mockscene";

const events = ((await (await get("/api/events?past=1")).json()).events ?? []).filter((e) => !/^\s*test\s*$/i.test(e.name ?? ""));
await writeFile(`${out}/events.json`, JSON.stringify(events));

// Pia (the member the guide signs in as) is going to the opening, went to yesterday's morning practice
// (that is the harvest the guide shares), and has two later events on her list. Not the Free Market:
// that is the one the guide RSVPs to.
const now = Date.now();
const ended = events.filter((e) => Date.parse(e.endsAt ?? e.startsAt) < now).sort((a, b) => Date.parse(b.endsAt ?? b.startsAt) - Date.parse(a.endsAt ?? a.startsAt));
const upcoming = events.filter((e) => Date.parse(e.startsAt) > now).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
const byName = (list, re) => list.find((e) => re.test(e.name));
const opening = byName(events, /Invocation|Opening/i) ?? ended[ended.length - 1];
const harvest = byName(ended, /Honoring Water/i) ?? ended.find((e) => e !== opening) ?? ended[0];
const rsvp = byName(upcoming, /Free Market/i) ?? upcoming[0];
const mine = upcoming.filter((e) => e !== rsvp).slice(0, 4).filter((_, i) => i % 2 === 0);
const seats = [opening, harvest, ...mine].filter(Boolean).map((e) => e.rkey);
await writeFile(`${out}/seats.txt`, [...new Set(seats)].join(","));
await writeFile(`${out}/picks.json`, JSON.stringify({ did: MOCK_DID, opening: opening?.rkey, harvest: harvest?.rkey, rsvp: rsvp?.rkey, mine: mine.map((e) => e.rkey) }, null, 2));

let images = 0;
for (const e of events) {
  if (!e.imageUrl) continue;
  const res = await get(e.imageUrl);
  const type = (res.headers.get("content-type") ?? "").split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) continue;
  const name = `${out}/img/${e.rkey}`;
  await writeFile(`${name}.bin`, Buffer.from(await res.arrayBuffer()));
  await writeFile(`${name}.key`, `event-image:${encodeURIComponent(MOCK_DID)}|${encodeURIComponent(e.rkey)}`);
  await writeFile(`${name}.meta`, JSON.stringify({ contentType: type, updated: "guide" }));
  images += 1;
}

const form = await (await get("/api/form/register-2026")).json();
const today = await (await get("/api/companion/today")).json();
const d = today.daily;
const lines = [
  `UPDATE forms SET title = ${sql(form.title)}, fields = ${sql(JSON.stringify(form.fields))}, completion = ${sql(form.completion ? JSON.stringify(form.completion) : null)}, active = 1 WHERE slug = 'register-2026';`,
  d ? `INSERT OR REPLACE INTO companion_daily (date, title, body, title_es, body_es, question, question_es) VALUES (${[d.date, d.title, d.body, d.title_es, d.body_es, d.question, d.question_es].map(sql).join(", ")});` : "",
  // Pia is registered (her answers are sample text, not anyone's).
  "INSERT INTO people (id, email, name, subscribed, unsubscribe_token, created_at, updated_at) VALUES ('p-guide-pia', 'pia@example.org', 'Pia Hansen', 1, 'tok-guide-pia', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');",
  "INSERT INTO submissions (id, person_id, form_slug, data, created_at, updated_at) VALUES ('s-guide-pia', 'p-guide-pia', 'register-2026', '{\"full_name\":\"Pia Hansen\",\"email\":\"pia@example.org\"}', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');",
  // Rosa is registered too, and never installs the app: the email-only notification screens.
  "INSERT INTO people (id, email, name, subscribed, unsubscribe_token, created_at, updated_at) VALUES ('p-guide-rosa', 'rosa@example.org', 'Rosa Delgado', 1, 'tok-guide-rosa', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');",
  "INSERT INTO submissions (id, person_id, form_slug, data, created_at, updated_at) VALUES ('s-guide-rosa', 'p-guide-rosa', 'register-2026', '{\"full_name\":\"Rosa Delgado\",\"email\":\"rosa@example.org\"}', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');",
];
await writeFile(`${out}/seed.sql`, lines.filter(Boolean).join("\n") + "\n");
console.log(`guide-fetch-live: ${events.length} events (${images} photos), form ${form.slug} (${form.fields.length} questions), practice ${d?.date ?? "none"}; Pia's seats ${seats.length}`);
