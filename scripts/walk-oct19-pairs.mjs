// The before/after screens for the Oct 19 walk's fixes, on the local walk stack
// (scripts/walk-oct19-stack.sh + walk-oct19-seed.mjs). Run once on the old build ("before")
// and once on the fixed one ("after"). Only ever talks to 127.0.0.1.
//
//   node scripts/walk-oct19-pairs.mjs <state-dir> <before|after> <out-dir>
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [state, label, out] = process.argv.slice(2);
if (!state || !label || !out) { console.error("usage: node scripts/walk-oct19-pairs.mjs <state-dir> <before|after> <out-dir>"); process.exit(2); }
await mkdir(out, { recursive: true });
const env = Object.fromEntries((await readFile(`${state}/env`, "utf8")).trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)));
const { BASE, PERSIST } = env;
const DID = "did:plc:mockscene";
const email = await readFile("walk-oct19/raw/evening.txt", "utf8");
const links = [...email.matchAll(/https?:\/\/\S+\/n\/\S+/g)].map((m) => new URL(m[0]).pathname);
const rsvpLink = (rkey) => links.find((p) => Buffer.from(p.split("/n/")[1].split(".")[0], "base64url").toString().includes(`"r":"${rkey}"`));
const kindLink = (k) => links.find((p) => Buffer.from(p.split("/n/")[1].split(".")[0], "base64url").toString().includes(`"k":"${k}"`));
const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "cohere", "--local", "--persist-to", PERSIST, "--command", command], { stdio: "ignore" });
const PHOTO = "src/assets/photos/shared-meal.webp";

const browser = await chromium.launch();
const failures = [];
async function ctx({ width = 390, height = 844, cookie, at = "2026-10-20T15:00:00Z" } = {}) {
  const c = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  await c.clock.setFixedTime(new Date(at));
  await c.addInitScript(() => { try { localStorage.setItem("cohere-look", "ecology"); } catch { /* opaque frame */ } });
  await c.route("**/*", (r) => (new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort()));
  if (cookie) await c.addCookies([{ name: "__Host-rs_session", value: cookie, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  return c;
}
const shot = (page, name, opts = {}) => page.screenshot({ path: `${out}/${name}-${label}.png`, ...opts });
// ONLY="rsvp-link,member" runs just those steps.
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
async function step(name, fn) { if (ONLY && !ONLY.includes(name)) return; try { await fn(); } catch (e) { failures.push(`${name}: ${String(e).split("\n")[0].slice(0, 160)}`); } }
const settle = (page, ms = 900) => page.waitForTimeout(ms);
/** Viewport frames at fixed times after navigation, to show a load. */
async function frames(page, path, name, times = [150, 600, 2000], fullPage = false) {
  const t0 = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: "commit" });
  for (const t of times) { await page.waitForTimeout(Math.max(0, t - (Date.now() - t0))); await shot(page, `${name}-${t}ms`, { fullPage }); }
}

// 1. The 8 PM email's RSVP link, before and after the press (phone).
await step("rsvp-link", async () => {
  const c = await ctx(); const p = await c.newPage();
  await p.goto(`${BASE}${rsvpLink("wk-story-21") ?? rsvpLink("wk-potluck-20")}`);
  await p.getByTestId("link-confirm").waitFor({ timeout: 8000 }).catch(() => {});
  await settle(p); await shot(p, "01-rsvp-link");
  await p.getByTestId("link-confirm").click(); await settle(p, 1500); await shot(p, "02-rsvp-link-done");
  await c.close();
});
// 2. The unsubscribe page's title (phone).
await step("unsub", async () => {
  const c = await ctx(); const p = await c.newPage();
  await p.goto(`${BASE}${kindLink("unsub")}`); await p.getByTestId("link-unsub").waitFor({ timeout: 8000 }); await settle(p);
  await shot(p, "03-unsubscribe"); await c.close();
});
// 3. An emailed settings link for someone whose emails are in Spanish (phone).
await step("settings-es", async () => {
  sql("INSERT INTO notify_prefs (person_key, email, locale, created_at, updated_at) VALUES ('mailto:river.walk@example.test', 'river.walk@example.test', 'es', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z') ON CONFLICT(person_key) DO UPDATE SET locale = 'es'");
  const c = await ctx(); const p = await c.newPage();
  await p.goto(`${BASE}${kindLink("settings")}`); await p.locator("h1").first().waitFor({ timeout: 8000 }); await settle(p);
  await shot(p, "04-settings-link-spanish");
  sql("UPDATE notify_prefs SET locale = 'en' WHERE person_key = 'mailto:river.walk@example.test'");
  await c.close();
});
// 4. An event's time in Spanish (phone).
await step("event-es", async () => {
  const c = await ctx(); const p = await c.newPage();
  await p.goto(`${BASE}/events/${DID}/wk-potluck-20`); await p.locator("h1").first().waitFor();
  await p.getByRole("button", { name: "Español", exact: true }).first().click(); await settle(p, 1200);
  await p.evaluate(() => window.scrollTo(0, 0)); await settle(p, 300);
  await shot(p, "05-event-time-spanish"); await c.close();
});
// 5. Home, signed out, loading (phone): the sign-in line arrives late and pushes the page down.
await step("home-load", async () => {
  const c = await ctx(); const p = await c.newPage();
  await p.route("**/api/config", async (r) => { await new Promise((ok) => setTimeout(ok, 900)); await r.continue(); });
  await frames(p, "/", "06-home-load", [700, 2500]); await c.close();
});
// 6. Signed-in member: Today while it loads, and Your next after an RSVP (phone).
await step("member", async () => {
  const c = await ctx({ cookie: "mock-peer", at: "2026-10-20T19:00:00Z" }); const p = await c.newPage();
  await p.route("**/xrpc/social.scenius.getSession", async (r) => { await new Promise((ok) => setTimeout(ok, 900)); await r.continue(); });
  await frames(p, "/today", "07-today-load", [700, 2500], true);
  await p.unroute("**/xrpc/social.scenius.getSession");
  await p.goto(`${BASE}/events/${DID}/wk-potluck-20`); await p.getByTestId("event-rsvp").waitFor();
  const cancel = p.getByRole("button", { name: /Cancel my RSVP/i }).first();
  if (!(await cancel.count())) { await p.getByTestId("event-rsvp").getByRole("button", { name: /^RSVP/i }).first().click(); await settle(p, 1500); }
  await p.goto(`${BASE}/calendar?day=2026-10-20`); await p.getByTestId("your-next").waitFor({ timeout: 8000 }); await settle(p);
  await p.getByTestId("your-next").scrollIntoViewIfNeeded(); await shot(p, "08-calendar-your-next");
  await p.goto(`${BASE}/events/${DID}/wk-potluck-20`); await p.getByTestId("event-rsvp").waitFor(); await settle(p);
  await p.getByRole("button", { name: /Cancel my RSVP/i }).first().click().catch(() => {}); await settle(p);
  // Board while its posts load.
  await p.route("**/xrpc/social.scenius.listCirclePosts*", async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
  await p.goto(`${BASE}/board`); await p.waitForTimeout(900); await shot(p, "09-board-loading");
  await c.close();
});
// 7. The organizer: a newsletter photo added (laptop), and the event editor's dates (phone).
await step("admin-newsletter", async () => {
  const c = await ctx({ width: 1280, height: 800, cookie: "sess-builder", at: "2026-10-20T16:00:00Z" }); const p = await c.newPage();
  await p.goto(`${BASE}/admin`); await p.getByRole("tab", { name: "Newsletter", exact: true }).click();
  await p.locator("#nlnew").click(); await p.locator("#nlsubject").fill("Photos from the creek");
  await p.locator("#nlbody").fill("Hello friends,\n\nA few pictures from this week.\n\nWith love,\nThe COhere team");
  await p.getByRole("button", { name: "Add image" }).click();
  await p.getByTestId("nl-image-file").setInputFiles(PHOTO);
  await p.locator("#nlimgalt").fill("People standing in a circle in the park");
  await p.getByRole("button", { name: /Upload and insert/i }).click();
  await p.waitForFunction(() => /Photo added/.test(document.getElementById("nlmsg")?.textContent ?? ""), null, { timeout: 15000 });
  await p.locator("#nlmsg").scrollIntoViewIfNeeded(); await settle(p);
  await shot(p, "10-admin-photo-added");
  await p.locator(".tabs").first().scrollIntoViewIfNeeded();
  await p.locator(".tabs").first().screenshot({ path: `${out}/11-admin-tabs-${label}.png` });
  p.once("dialog", (d) => d.accept());
  await p.locator("#nldelete").click().catch(() => {}); await settle(p);
  await c.close();
});
await step("admin-event-phone", async () => {
  const c = await ctx({ cookie: "sess-builder", at: "2026-10-20T16:00:00Z" }); const p = await c.newPage();
  await p.goto(`${BASE}/admin`); await p.getByRole("tab", { name: "Events", exact: true }).click();
  await p.locator("#newevent").first().click();
  await p.locator("#evstart").waitFor(); await p.locator("#evstart").scrollIntoViewIfNeeded(); await settle(p);
  await shot(p, "12-admin-event-dates-phone");
  await c.close();
});
// 8. Spanish chosen, then a reload (phone).
await step("lang-reload", async () => {
  const c = await ctx(); const p = await c.newPage();
  await p.goto(`${BASE}/calendar?day=2026-10-20`); await p.locator("h1").first().waitFor();
  await p.getByRole("button", { name: "Español", exact: true }).first().click(); await settle(p);
  await p.reload(); await p.locator("h1").first().waitFor(); await settle(p, 1200);
  await p.evaluate(() => window.scrollTo(0, 0)); await settle(p, 300);
  await shot(p, "13-spanish-after-reload"); await c.close();
});
await browser.close();
console.log(failures.length ? `pairs (${label}): ${failures.length} step(s) failed:\n${failures.map((f) => `  - ${f}`).join("\n")}` : `pairs (${label}): all steps ran`);
