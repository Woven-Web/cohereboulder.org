// Browser check for the comparison switches (T-113): the public site's
// ?look=almanac skin and Today's ?trail=row variant. Runs against a local
// `wrangler dev` (the real Worker + a local D1 with a register-2026 form) —
// never production, never real mail.
//
//   node scripts/look-e2e.mjs http://127.0.0.1:8795 [/dir/for/screenshots]
//
// scripts/ci-e2e.sh lane 13 loads worker/schema.sql and scripts/fixtures/look-form.sql
// (a register-2026 form with text, email, radio, checkboxes, textarea and checkbox
// questions) into a throwaway D1 BEFORE starting `wrangler dev`, then calls this.
//
// Asserts at 360 / 390 / 1280 (and 1600×1200 in screenshots): `/`, `/register`,
// `/about` in both looks — no page errors, no horizontal overflow, the look
// sticks for the session and `?look=classic` undoes it; the Almanac register
// form keeps its funnel beacon and submits; AA contrast on the calls to action;
// Today with ?trail=zigzag and ?trail=row — accessible names, 44px targets
// (the row's live in its day sheet), the choice sticks.
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2];
const shots = process.argv[3];
if (!base) { console.error("usage: node scripts/look-e2e.mjs <wrangler-dev-url> [shots-dir]"); process.exit(2); }
if (shots) await mkdir(shots, { recursive: true });

const fails = [];
const check = (cond, m) => { if (!cond) { fails.push(m); console.error(`FAIL ${m}`); } else console.log(`PASS ${m}`); };
const browser = await chromium.launch();
const SIZES = [[360, 780], [390, 844], [1280, 800]];

async function session({ width, height, when }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (when) await context.clock.setFixedTime(new Date(when));
  // Embedded films and the PDF viewer are not under test.
  await context.route("https://www.youtube.com/**", (r) => r.fulfill({ contentType: "text/html", body: "" }));
  await context.route("**/Ecosystem.pdf", (r) => r.fulfill({ contentType: "text/html", body: "" }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|Ecosystem\.pdf|youtube/i.test(m.text())) errors.push(m.text()); });
  return { context, page, errors };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page, name, full = false) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: full }); };

// WCAG contrast of an element's text against the colour actually behind it.
const contrast = (locator) => locator.evaluate((el) => {
  const rgb = (c) => c.match(/[\d.]+/g).map(Number);
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  let bg = null;
  for (let n = el; n && !bg; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length < 4 || c[3] > 0.99) { if (getComputedStyle(n).backgroundColor !== "rgba(0, 0, 0, 0)") bg = c; } }
  const a = lum(rgb(getComputedStyle(el).color)), b = lum(bg ?? [255, 255, 255]);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});

// ───────────── Home, Register, About in both looks ─────────────
for (const [w, h] of SIZES) {
  const { context, page, errors } = await session({ width: w, height: h });
  for (const look of ["classic", "almanac"]) {
    for (const path of ["/", "/register", "/about"]) {
      await page.goto(`${base}${path}?look=${look}`, { waitUntil: "load" });
      await page.locator("h1").first().waitFor();
      if (path === "/register") await page.locator("#field-full_name").waitFor();
      const isAlm = await page.locator("h1").first().evaluate((el) => Boolean(el.closest(".alm")));
      check(isAlm === (look === "almanac"), `${path} renders the ${look} look at ${w}`);
      check((await overflow(page)) <= 0, `${path} ${look} has no horizontal overflow at ${w} (${await overflow(page)}px)`);
      check(errors.length === 0, `${path} ${look} at ${w}: no page errors${errors.length ? ` — ${errors[0]}` : ""}`);
      errors.length = 0;
      await shot(page, `${look}${path === "/" ? "-home" : path.replace("/", "-")}-${w}`, path === "/");
    }
  }
  // Home: the one call to action, within reach and AA.
  await page.goto(`${base}/?look=almanac`, { waitUntil: "load" });
  const cta = page.locator('main a[href="/register"]').first();
  const box = await cta.boundingBox();
  check(box && box.height >= 44 && box.y + box.height <= h * 1.5, `almanac home: Register is a ≥44px button high on the page at ${w} (y ${box && Math.round(box.y)})`);
  check((await contrast(cta)) >= 4.5, `almanac home: Register button contrast ≥ 4.5 at ${w}`);
  check((await contrast(page.locator("main .small").first())) >= 4.5, `almanac home: small text contrast ≥ 4.5 at ${w}`);
  check((await contrast(page.locator("main .folio").first())) >= 4.5, `almanac home: folio contrast ≥ 4.5 at ${w}`);
  // The look sticks across navigation, and ?look=classic undoes it.
  await page.getByRole("link", { name: /Join COhere|Register|Únete/ }).first().click();
  await page.locator("h1").first().waitFor();
  check(await page.locator("h1").first().evaluate((el) => Boolean(el.closest(".alm"))), `the almanac look sticks across a link at ${w}`);
  await page.goto(`${base}/?look=classic`, { waitUntil: "load" });
  check(!(await page.locator("h1").first().evaluate((el) => Boolean(el.closest(".alm")))), `?look=classic goes back at ${w}`);
  await context.close();
}

// 1600×1200 Daylight screenshots only.
{
  const { context, page } = await session({ width: 1600, height: 1200 });
  for (const look of ["classic", "almanac"]) for (const path of ["/", "/register", "/about"]) {
    await page.goto(`${base}${path}?look=${look}`, { waitUntil: "load" });
    check((await overflow(page)) <= 0, `${path} ${look} no overflow at 1600`);
    await shot(page, `${look}${path === "/" ? "-home" : path.replace("/", "-")}-1600`);
  }
  await context.close();
}

// ───────────── Register: the Almanac form still converts ─────────────
for (const [w, h] of [[360, 780], [1280, 800]]) {
  const { context, page, errors } = await session({ width: w, height: h });
  const beacons = [];
  page.on("request", (r) => { if (r.url().includes("/api/funnel/")) beacons.push(r.postData() ?? ""); });
  await page.goto(`${base}/register?look=almanac`, { waitUntil: "load" });
  await page.locator("#field-full_name").waitFor();
  await page.waitForTimeout(600);
  check(beacons.some((b) => b.includes("view")), `almanac register sends the funnel "view" beacon at ${w}`);
  const submit = page.getByRole("button", { name: "Submit Registration" });
  const sbox = await submit.boundingBox();
  check(sbox && sbox.height >= 48, `submit button is ≥48px tall at ${w} (${sbox && Math.round(sbox.height)})`);
  check((await contrast(submit)) >= 4.5, `submit button contrast ≥ 4.5 at ${w}`);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.df-card [role=radiogroup]>div, .df-card [role=checkbox]')].map((n) => { const r = (n.getAttribute("role") === "checkbox" ? n.parentElement : n).getBoundingClientRect(); return Math.round(r.height); }));
  check(rows.length > 0 && rows.every((x) => x >= 44), `choice rows are ≥44px tall at ${w} (${rows.join(",")})`);
  await page.locator("#field-full_name").fill("Look Tester");
  await page.locator("#field-email").fill(`look-${w}-${Date.now()}@example.test`);
  await page.locator("#field-volunteer_interest-Yes").click();
  await page.locator("#field-interests-Music").click();
  await shot(page, `almanac-register-filled-${w}`, true);
  const posted = page.waitForResponse((r) => r.url().includes("/api/submit/register-2026") && r.request().method() === "POST");
  await submit.click();
  const res = await posted;
  check(res.ok(), `register form submits to the local Worker at ${w} (${res.status()})`);
  await page.getByRole("heading", { name: /woven in|You're in/i }).waitFor({ timeout: 10000 }).catch(() => {});
  check(await page.getByRole("heading", { name: /woven in|You're in/i }).count() > 0, `the thank-you shows at ${w}`);
  check(beacons.some((b) => b.includes("submit_attempt")), `submit_attempt beacon fires at ${w}`);
  check(errors.length === 0, `register: no page errors at ${w}${errors.length ? ` — ${errors[0]}` : ""}`);
  await shot(page, `almanac-register-done-${w}`);
  await context.close();
}

// ───────────── Today's trail, both variants ─────────────
const DAY3 = "2026-10-17T15:40:00Z";
for (const [w, h] of SIZES) {
  for (const trail of ["zigzag", "row"]) {
    const { context, page, errors } = await session({ width: w, height: h, when: DAY3 });
    await context.addInitScript(() => { if (!localStorage.getItem("cohere-practice-done")) localStorage.setItem("cohere-practice-done", JSON.stringify(["2026-10-15", "2026-10-16"])); });
    await page.goto(`${base}/today?trail=${trail}`, { waitUntil: "load" });
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    const phoneRow = trail === "row" && w < 820;
    if (!phoneRow) {
      check(await page.getByRole("link", { name: /Saturday Oct 17, today/ }).count() === 1, `${trail}: trail names today at ${w}`);
      check(await page.getByRole("link", { name: /Thursday Oct 15, practice done/ }).count() === 1, `${trail}: trail marks a finished day at ${w}`);
      const sizes = await page.evaluate(() => [...document.querySelectorAll(".trail--fit .trail__day")].map((a) => { const r = a.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      check(sizes.length === 11 && sizes.every(([a, b]) => a >= 44 && b >= 44), `${trail}: eleven ≥44×44 links at ${w}`);
    } else {
      check(await page.locator(".trail--fit .trail__day").count() === 0, `row: no per-day tap targets on the phone at ${w}`);
      const opener = page.getByRole("button", { name: /Festival days, Oct 15 to 25.*Saturday Oct 17, today.*day list/ });
      check(await opener.count() === 1, `row: one button names the trail and today at ${w}`);
      const ob = await opener.boundingBox();
      check(ob && ob.height >= 44, `row: the trail button is ≥44px tall at ${w} (${ob && Math.round(ob.height)})`);
      const marks = await page.evaluate(() => [...document.querySelectorAll(".trail__mark")].length);
      check(marks === 11, `row: eleven marks at ${w}`);
      await shot(page, `today-row-${w}`);
      await opener.click();
      const sheet = page.getByRole("dialog", { name: "Pick a festival day" });
      await sheet.waitFor();
      const links = await sheet.locator("a.trail__day").evaluateAll((as) => as.map((a) => { const r = a.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), a.getAttribute("aria-label")]; }));
      check(links.length === 11 && links.every(([a, b]) => a >= 44 && b >= 44), `row: the day sheet has eleven ≥44×44 links at ${w}`);
      check(links.some(([, , n]) => /Thursday Oct 15, practice done/.test(n)) && links.some(([, , n]) => /Saturday Oct 17, today/.test(n)), `row: sheet links keep accessible names at ${w}`);
      await shot(page, `today-row-sheet-${w}`);
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached" });
      check(await opener.evaluate((el) => el === document.activeElement), `row: focus returns to the trail button at ${w}`);
      await opener.click();
      await page.getByRole("dialog").getByRole("link", { name: /Sunday Oct 18/ }).click();
      await page.waitForURL(/\/calendar\?day=2026-10-18/);
      check(true, `row: a sheet day opens the Calendar for that day at ${w}`);
      await page.goto(`${base}/today`, { waitUntil: "load" });
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      check(await page.locator(".trail--row").count() === 1, `row: the choice sticks without the query at ${w}`);
    }
    check((await overflow(page)) <= 0, `${trail}: Today has no horizontal overflow at ${w} (${await overflow(page)}px)`);
    check(errors.length === 0, `${trail}: Today has no page errors at ${w}${errors.length ? ` — ${errors[0]}` : ""}`);
    if (!phoneRow) await shot(page, `today-${trail}-${w}`);
    await context.close();
  }
}

await browser.close();
if (fails.length) { console.error(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log("\nlook-e2e: all checks passed");
