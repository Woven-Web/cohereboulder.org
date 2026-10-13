// Before/after screenshots for the copy pass: Home, Today, Calendar, Board (signed out),
// Me > Notifications and the event page (signed in, regenOS mock), at 390 and 1280.
//   node scripts/copy-shots.mjs <worker-url> <mock-url> <out-dir>
// Local wrangler dev + regenos-mock only; scripts/copy-shots.sh starts them.
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [base, mock, dir] = process.argv.slice(2);
if (!base || !mock || !dir) { console.error("usage: node scripts/copy-shots.mjs <worker> <mock> <dir>"); process.exit(2); }
await mkdir(dir, { recursive: true });
const EV = "ev-eco-e2e-1";
for (const [rkey, name, startsAt, endsAt] of [[EV, "Ecology Free Market", "2026-10-17T16:00:00.000Z", "2026-10-17T19:00:00.000Z"], ["ev-eco-e2e-2", "Ecology Skill Share", "2026-10-17T19:00:00.000Z", "2026-10-17T23:00:00.000Z"]]) {
  await fetch(`${mock}/xrpc/social.scenius.createEvent`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mock-token" }, body: JSON.stringify({ authority: "did:plc:mockscene", rkey, name, description: "A real-enough description for the lane.", startsAt, endsAt, mode: "inperson", placeName: "Martin Park", locality: "Boulder", region: "CO", attendance: "open" }) });
}
const SHOTS = [
  ["home", "/", null], ["today", "/today", null], ["calendar", "/calendar", null], ["board", "/board", null],
  ["me-notifications", "/more/notifications", "mock-peer"], ["event", `/events/did:plc:mockscene/${EV}`, "mock-peer"],
];
const browser = await chromium.launch();
for (const [w, h] of [[390, 844], [1280, 800]]) {
  for (const [name, path, member] of SHOTS) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await context.clock.setFixedTime(new Date("2026-10-17T16:00:00Z"));
    await context.route("https://www.youtube.com/**", (r) => r.fulfill({ contentType: "text/html", body: "" }));
    await context.route("**/Ecosystem.pdf", (r) => r.fulfill({ contentType: "text/html", body: "" }));
    if (member) await context.addCookies([{ name: "__Host-rs_session", value: member, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    await page.goto(`${base}${path}?look=ecology`, { waitUntil: "load" });
    await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${dir}/${name}-${w}.png`, fullPage: true });
    await context.close();
  }
}
await browser.close();
console.log(`shots in ${dir}`);
