// What other members have already shared, for the guide's screenshots: harvests on the events that
// have ended, written through the LOCAL Worker as the mock's guide personas (MOCK_GUIDE=1 sessions).
// Sample words and one real COhere photo (src/assets/photos), never anyone's actual harvest.
//
//   node scripts/guide-seed.mjs <local-worker-url> <live-dir from guide-fetch-live.mjs>
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const [base, dir] = process.argv.slice(2);
if (!base || !/^http:\/\/127\.0\.0\.1:/.test(base) || !dir) { console.error("usage: node scripts/guide-seed.mjs <http://127.0.0.1:port> <live-dir>"); process.exit(2); }
const picks = JSON.parse(await readFile(`${dir}/picks.json`, "utf8"));
const jpeg = (file) => `data:image/jpeg;base64,${execFileSync("magick", [file, "-resize", "900x900>", "-quality", "72", "jpeg:-"]).toString("base64")}`;

const HARVESTS = [
  ["guide-mara", picks.opening, "So many people I had only met online, all at one long table. The kids ran the river stones the whole evening.", "src/assets/photos/shared-meal.webp"],
  ["guide-teo", picks.opening, "The invocation reminded me why I moved here. I left with three new neighbours' phone numbers.", null],
  ["guide-lin", picks.harvest, "Quiet, cold and clear. I heard the creek differently after we stopped talking.", null],
];
for (const [who, rkey, body, photo] of HARVESTS) {
  if (!rkey) continue;
  const res = await fetch(`${base}/api/harvests`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, cookie: `__Host-rs_session=${who}` },
    body: JSON.stringify({ eventDid: picks.did, eventRkey: rkey, body, lang: "en", ...(photo ? { photo: jpeg(photo) } : {}) }),
  });
  if (res.status !== 201) { console.error(`guide-seed: ${who} on ${rkey} answered ${res.status} ${await res.text()}`); process.exit(1); }
}
console.log(`guide-seed: ${HARVESTS.length} harvests`);
