// Screenshots of every page and app screen under ?look=ecology at five widths,
// signed out and signed in (regenOS mock), plus a plain report of horizontal
// overflow, page errors, the bottom tab bar and the masthead destinations.
//
//   node scripts/polish-shots.mjs http://127.0.0.1:28981 http://127.0.0.1:28980 /dir [when-iso]
//
// Local wrangler dev + regenos-mock only (see scripts/ci-e2e.sh lane 14 for the setup).
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [base, mock, dir, when = "2026-10-17T16:00:00Z"] = process.argv.slice(2);
if (!base || !mock || !dir) { console.error("usage: node scripts/polish-shots.mjs <worker> <mock> <dir> [when]"); process.exit(2); }
await mkdir(dir, { recursive: true });
const SIZES = [[390, 844], [768, 1024], [1280, 800], [1600, 1000]];
const EV = "ev-eco-e2e-1";
for (const [rkey, name, startsAt, endsAt] of [[EV, "Ecology Free Market", "2026-10-17T16:00:00.000Z", "2026-10-17T19:00:00.000Z"], ["ev-eco-e2e-2", "Ecology Skill Share", "2026-10-17T19:00:00.000Z", "2026-10-17T23:00:00.000Z"], ["ev-eco-e2e-3", "Ecology Creek Walk", "2026-10-18T16:00:00.000Z", "2026-10-18T18:00:00.000Z"]]) {
  await fetch(`${mock}/xrpc/social.scenius.createEvent`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mock-token" }, body: JSON.stringify({ authority: "did:plc:mockscene", rkey, name, description: "A real-enough description for the lane.", startsAt, endsAt, mode: "inperson", placeName: "Martin Park", locality: "Boulder", region: "CO", attendance: "open" }) });
}
const PAGES = [["home", "/"], ["today", "/today"], ["calendar", "/calendar"], ["board", "/board"]];
const browser = await chromium.launch();
const rows = [];
for (const [phase, at] of [["during", when], ["before", "2026-10-12T16:00:00Z"]]) for (const member of [null, "mock-peer"]) {
  for (const [w, h] of SIZES) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await context.clock.setFixedTime(new Date(at));
    await context.route("https://www.youtube.com/**", (r) => r.fulfill({ contentType: "text/html", body: "" }));
    await context.route("**/Ecosystem.pdf", (r) => r.fulfill({ contentType: "text/html", body: "" }));
    if (member) await context.addCookies([{ name: "__Host-rs_session", value: member, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|Ecosystem\.pdf|youtube|non-existent route/i.test(m.text())) errors.push(m.text()); });
    for (const [name, path] of PAGES) {
      errors.length = 0;
      await page.goto(`${base}${path}${path.includes("?") ? "&" : "?"}look=ecology`, { waitUntil: "load" });
      await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(700);
      const facts = await page.evaluate(() => {
        const vis = (el) => el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== "none";
        const bottom = [...document.querySelectorAll(".tabs,[data-testid=bottom-tabs]")].find((e) => vis(e) && getComputedStyle(e).position === "fixed");
        const mast = document.querySelector(".mast .tabs");
        const wide = Math.max(...[...document.querySelectorAll("#root p")].map((p) => p.getBoundingClientRect().width), 0);
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, bottom: Boolean(bottom), mastTabs: vis(mast) ? [...mast.querySelectorAll("a")].map((a) => a.textContent.trim()) : [], widestP: Math.round(wide), path: location.pathname };
      });
      await page.screenshot({ path: `${dir}/${phase}-${member ? "in" : "out"}-${name}-${w}.png`, fullPage: true });
      rows.push({ phase, who: member ? "in" : "out", name, w, ...facts, errors: errors.slice(0, 2) });
    }
    await context.close();
  }
}
await browser.close();
for (const r of rows) console.log(`${r.phase.padEnd(6)} ${r.who.padEnd(3)} ${r.name.padEnd(9)} ${String(r.w).padStart(4)} overflow=${r.overflow} bottomBar=${r.bottom} masthead=[${r.mastTabs.join("|")}] pMax=${r.widestP} ${r.path !== "/" && r.name !== "home" && !r.path.startsWith("/" + r.name.split("-")[0]) ? "→" + r.path : ""} ${r.errors.length ? "ERR " + r.errors[0].slice(0, 120) : ""}`);

const bad = rows.filter((r) => r.overflow > 0 || r.errors.length);
console.log(`\n${rows.length} shots, ${bad.length} with overflow or page errors`);
if (bad.length) process.exit(1);
