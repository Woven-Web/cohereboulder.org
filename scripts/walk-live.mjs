// Read-only walk of a deployed COhere site: loads each public screen at four sizes in English and
// Spanish, screenshots it, and lists what a script can see (sideways scroll, text wider than its box,
// console errors, slow loads). The screenshots are for a person to look at.
// Safe on production: it never signs in, and aborts every request that is not a GET.
//
//   node scripts/walk-live.mjs https://cohereboulder.org walk/live [past-rkey] [future-rkey]
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [base, shots, pastKey = "ev-mtka98hjazago4", futureKey = "ev-muo83dv9iwdjyg"] = process.argv.slice(2);
if (!base || !shots) { console.error("usage: node scripts/walk-live.mjs <url> <shots-dir> [past-rkey] [future-rkey]"); process.exit(2); }
await mkdir(shots, { recursive: true });
const DID = "did:plc:w54s52ycbw5lreyhlzexredb";
const SIZES = [[1280, 800], [1440, 900], [1024, 768], [390, 844]];
const SCREENS = [
  ["home", "/"],
  ["today", "/today"],
  ["calendar-week", "/calendar"],
  ["calendar-day-today", "/calendar?day=2026-10-16"],
  ["calendar-day-past", "/calendar?day=2026-10-15"],
  ["calendar-day-future", "/calendar?day=2026-10-19"],
  ["event-past", `/events/${DID}/${pastKey}`],
  ["event-future", `/events/${DID}/${futureKey}`],
  ["about", "/about"],
  ["register", "/register"],
  ["board-signedout", "/board"],
  ["people-signedout", "/people"],
  ["more", "/more"],
  ["login", "/login"],
];

const findings = (page) => page.evaluate(() => {
  const out = [];
  const sx = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (sx > 0) out.push(`page scrolls sideways by ${sx}px`);
  const name = (e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)} "${(e.textContent || "").trim().slice(0, 24)}"`;
  const vw = document.documentElement.clientWidth;
  for (const el of document.querySelectorAll("main *, header *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.display === "contents" || cs.visibility === "hidden") continue;
    if (el.closest("[role=switch], .switch, [role=checkbox], .peer, .trail__days, .trail__day, .trail--pick, [role=listbox]")) continue;
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === "visible" && el.clientWidth > 0) out.push(`text wider than its box: ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    const r = el.getBoundingClientRect();
    if (r.width && r.right > vw + 1) out.push(`past the right edge: ${name(el)}`);
  }
  return [...new Set(out)].slice(0, 8);
});

const browser = await chromium.launch();
const problems = [];
for (const [w, h] of SIZES) {
  for (const lang of ["en", "es"]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await context.route("**/*", (r) => (r.request().method() === "GET" || r.request().method() === "HEAD" ? r.continue() : r.abort()));
    for (const [name, path] of SCREENS) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(`page error ${e}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 120)}`); });
      const t0 = Date.now();
      await page.goto(`${base}${path}`, { waitUntil: "load" });
      await page.locator("h1, h2").first().waitFor({ timeout: 10000 }).catch(() => errors.push("no heading in 10s"));
      const ms = Date.now() - t0;
      if (lang === "es") {
        await page.getByRole("button", { name: "Español", exact: true }).first().click({ timeout: 3000 }).catch(() => errors.push("no language toggle reachable"));
      }
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${shots}/${name}-${lang}-${w}.png`, fullPage: true });
      if (ms > 4000) problems.push(`${name} ${lang} @${w}: slow load ${ms}ms`);
      for (const f of await findings(page)) problems.push(`${name} ${lang} @${w}: ${f}`);
      for (const e of errors) problems.push(`${name} ${lang} @${w}: ${e}`);
      await page.close();
    }
    await context.close();
  }
}
await browser.close();
console.log(problems.length ? `walk: ${problems.length} mechanical finding(s):\n${problems.map((p) => `  - ${p}`).join("\n")}` : "walk: no mechanical findings");
