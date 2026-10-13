// Browser check for the comparison switches (T-113): the public site's
// ?look=almanac skin and Today's ?trail=row variant. Runs against a local
// `wrangler dev` (the real Worker + a local D1 with a register-2026 form) —
// never production, never real mail.
//
//   node scripts/look-e2e.mjs http://127.0.0.1:8795 [/dir/for/screenshots]
//
// scripts/ci-e2e.sh lane 13 loads worker/schema.sql and migration 0002 (the real
// register-2026 questions and completion screen — questions only, no member data:
// text, email, tel, radio with allow_other, textarea, checkbox) into a throwaway D1
// BEFORE starting `wrangler dev`, then calls this.
//
// Asserts at 360 / 390 / 1280 (and 1600×1200 in screenshots): `/`, `/register`,
// `/about` in both looks — no page errors, no horizontal overflow, the look
// sticks for the session and `?look=classic` undoes it; the Almanac register
// form keeps its funnel beacon and submits, blocks an empty submit without a POST,
// announces a server error, and works in Spanish; Register stays in the phone
// masthead even with regenOS sign-in on; the pages that keep a classic body
// (Login, Propose, Co-create, Archive, …) fit, throw nothing, keep a sticky
// masthead and clear the phone tab bar; AA contrast on the calls to action;
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
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|Ecosystem\.pdf|youtube|non-existent route/i.test(m.text())) errors.push(m.text()); });
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


// ───────────── Register stays reachable; hybrid pages under the Almanac chrome ─────────────
const HYBRID = ["/login?token=bogus", "/propose", "/co-create", "/archive", "/archive/2024", "/join-2025", "/presskit", "/join/test-token", "/no-such-page"];
for (const [w, h] of [[360, 780], [1280, 800]]) {
  const { context, page, errors } = await session({ width: w, height: h });
  // regenOS sign-in ON: the case that used to squeeze Register out of the phone masthead.
  await context.route("**/api/config", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ regenosLoginEnabled: true, collectiveDid: null }) }));
  for (const path of ["/", "/about", "/join/test-token", "/propose"]) {
    await page.goto(`${base}${path}?look=almanac`, { waitUntil: "load" });
    await page.locator(".mast").first().waitFor();
    await page.getByRole("button", { name: /Sign in/i }).first().waitFor({ state: "attached" }).catch(() => {});
    const reg = page.locator(".mast .mast__register").first();
    const rb = await reg.boundingBox();
    check(rb && rb.height >= 44 && rb.x >= 0 && rb.x + rb.width <= w, `${path}: Register is in the masthead (≥44px, on screen) with sign-in on at ${w}`);
    if (w < 820) {
      check(await page.locator(".mast__end > button").first().isHidden().catch(() => true), `${path}: Sign in leaves the phone masthead at ${w}`);
      const foot = page.locator(".foot__account button").first();
      await foot.scrollIntoViewIfNeeded().catch(() => {});
      check(await foot.isVisible().catch(() => false), `${path}: Sign in is in the footer on the phone at ${w}`);
    } else {
      check(await page.locator(".mast__end > button").first().isVisible().catch(() => false), `${path}: Sign in stays in the masthead at ${w}`);
    }
  }
  await context.close();
}
for (const [w, h] of [[360, 780], [1280, 800]]) {
  const { context, page, errors } = await session({ width: w, height: h });
  for (const path of HYBRID) {
    await page.goto(`${base}${path}${path.includes("?") ? "&" : "?"}look=almanac`, { waitUntil: "load" });
    await page.locator("h1, h2").first().waitFor();
    await page.locator(".alm .mast").first().waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(250);
    check(await page.locator(".alm .mast").count() > 0, `${path}: wears the almanac masthead at ${w}`);
    check((await overflow(page)) <= 0, `${path} almanac has no horizontal overflow at ${w} (${await overflow(page)}px)`);
    check(errors.length === 0, `${path} almanac at ${w}: no page errors${errors.length ? ` — ${errors[0]}` : ""}`);
    errors.length = 0;
    // The masthead sticks, and nothing ends under the fixed phone tab bar.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    const top = await page.locator(".alm .mast").first().evaluate((el) => Math.round(el.getBoundingClientRect().top));
    const scrolled = await page.evaluate(() => window.scrollY);
    check(scrolled === 0 || top === 0, `${path}: the masthead stays at the top after scrolling at ${w} (top ${top}, scrollY ${scrolled})`);
    if (w < 820) {
      const clear = await page.evaluate(() => {
        const tabs = document.querySelector(".tabs").getBoundingClientRect().top;
        // Lowest visible leaf in the page (containers carry padding, so they would hide the problem).
        let low = 0;
        for (const el of document.getElementById("root").querySelectorAll("*")) {
          if (el.children.length || el.closest(".tabs, .toast") || getComputedStyle(el).position === "fixed") continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) low = Math.max(low, r.bottom);
        }
        return tabs - low;
      });
      check(clear >= -0.5, `${path}: the tab bar does not cover the end of the page at ${w} (${Math.round(clear)}px clear)`);
    }
    await shot(page, `almanac-hybrid${path.replace(/[/?=]/g, "-")}-${w}`);
  }
  await context.close();
}

// ProposeEvent in the Almanac look: an empty submit says what is wrong on the page.
for (const [w, h] of [[360, 780], [1280, 800]]) {
  const { context, page, errors } = await session({ width: w, height: h });
  let posted = false;
  await context.route("**/api/events/propose", (r) => { posted = true; return r.fulfill({ status: 500, body: "{}" }); });
  await page.goto(`${base}/propose?look=almanac`, { waitUntil: "load" });
  const submit = page.locator("#pe-submit");
  await submit.waitFor();
  const sb = await submit.boundingBox();
  check(sb && sb.height >= 44, `/propose almanac: submit is ≥44px tall at ${w} (${Math.round(sb?.height ?? 0)}px)`);
  await submit.click();
  const nameErr = page.locator("#pe-name-err");
  check(await nameErr.isVisible(), `/propose almanac: empty submit shows the name error on the page at ${w}`);
  check(await page.locator("#pe-starts-err").isVisible(), `/propose almanac: empty submit shows the start-time error at ${w}`);
  check(await page.locator("[role=alert]").first().isVisible(), `/propose almanac: an alert summary is announced at ${w}`);
  check(await page.locator("#pe-name").evaluate((el) => el === document.activeElement && el.getAttribute("aria-invalid") === "true"), `/propose almanac: focus lands on the invalid name field at ${w}`);
  check((await contrast(nameErr)) >= 4.5, `/propose almanac: error text is AA at ${w}`);
  check(!posted, `/propose almanac: nothing is sent on an empty submit at ${w}`);
  for (const sel of ["#pe-name", "#pe-starts", "#pe-mode", "#pe-submit"]) {
    const b = await page.locator(sel).boundingBox();
    check(b && b.height >= 44, `/propose almanac: ${sel} is a 44px target at ${w}`);
  }
  check((await overflow(page)) <= 0, `/propose almanac with errors has no horizontal overflow at ${w}`);
  check(errors.length === 0, `/propose almanac empty submit at ${w}: no page errors`);
  await shot(page, `hybrid-after-e2e-propose-error-${w}`);
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
const THANKS = /Thank you for registering|Gracias por registrarte/;
for (const [w, h] of [[360, 780], [1280, 800]]) {
  const { context, page, errors } = await session({ width: w, height: h });
  const beacons = [];
  const posts = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/funnel/")) beacons.push(r.postData() ?? "");
    if (r.url().includes("/api/submit/") && r.method() === "POST") posts.push(r.url());
  });
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
  const phone = page.locator("#field-phone");
  check((await phone.getAttribute("type")) === "tel" && (await phone.boundingBox()).height >= 48, `the tel field is a styled ≥48px tel input at ${w}`);

  // Empty submit: the browser blocks it on the first required field, with a message, and nothing is POSTed.
  await submit.click();
  await page.waitForTimeout(300);
  const blocked = await page.evaluate(() => ({ active: document.activeElement?.id, msg: document.activeElement?.validationMessage ?? "", valid: document.querySelector(".df-card form").checkValidity() }));
  check(!blocked.valid && blocked.active === "field-full_name" && blocked.msg.length > 0, `empty submit stops on the first required field with a message at ${w} (${blocked.active}: ${blocked.msg})`);
  check(posts.length === 0, `empty submit sends no POST at ${w}`);
  const outline = await page.locator("#field-full_name").evaluate((el) => getComputedStyle(el).outlineStyle !== "none" && parseFloat(getComputedStyle(el).outlineWidth) >= 2);
  check(outline, `the invalid field shows a focus ring at ${w}`);

  await page.locator("#field-full_name").fill("Look Tester");
  await page.locator("#field-email").fill(`look-${w}-${Date.now()}@example.test`);
  await phone.fill("303 555 0100");
  await page.locator("#field-volunteer_interest-Yes").click();
  // allow_other: the "Other" choice opens a typeless text input that must wear the Almanac field style.
  await page.locator("#field-contribution-other").click();
  const other = page.getByLabel("Other — please specify");
  await other.fill("Sliding scale");
  const ob = await other.boundingBox();
  const borderOf = (loc) => loc.evaluate((el) => `${getComputedStyle(el).borderTopWidth} ${getComputedStyle(el).borderTopColor} ${getComputedStyle(el).borderRadius}`);
  const border = await borderOf(other);
  check(ob && ob.height >= 48 && border === (await borderOf(page.locator("#field-full_name"))), `the "Other" input is styled like the other fields at ${w} (${ob && Math.round(ob.height)}px, border ${border})`);
  await shot(page, `almanac-register-filled-${w}`, true);

  // A server failure is announced.
  await page.route("**/api/submit/register-2026", (r) => r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }));
  await submit.click();
  const alert = page.getByRole("alert").filter({ hasText: /couldn't submit/ });
  await alert.waitFor({ timeout: 10000 });
  check(await alert.isVisible(), `a server error shows a visible role=alert message at ${w}`);
  check((await contrast(alert)) >= 4.5, `the error message contrast ≥ 4.5 at ${w}`);
  await shot(page, `almanac-register-error-${w}`);
  await page.unroute("**/api/submit/register-2026");

  const posted = page.waitForResponse((r) => r.url().includes("/api/submit/register-2026") && r.request().method() === "POST");
  await submit.click();
  const res = await posted;
  check(res.ok(), `register form submits to the local Worker at ${w} (${res.status()})`);
  await page.getByRole("heading", { name: THANKS }).waitFor({ timeout: 10000 }).catch(() => {});
  check(await page.getByRole("heading", { name: THANKS }).count() > 0, `the thank-you shows at ${w}`);
  check(beacons.some((b) => b.includes("submit_attempt")), `submit_attempt beacon fires at ${w}`);
  check(errors.length === 0, `register: no page errors at ${w}${errors.length ? ` — ${errors[0]}` : ""}`);
  await shot(page, `almanac-register-done-${w}`);
  await context.close();
}

// Spanish pass: same form, same guarantees.
for (const [w, h] of [[360, 780], [1280, 800]]) {
  const { context, page, errors } = await session({ width: w, height: h });
  let posts = 0;
  page.on("request", (r) => { if (r.url().includes("/api/submit/") && r.method() === "POST") posts++; });
  await page.goto(`${base}/register?look=almanac`, { waitUntil: "load" });
  await page.locator("#field-full_name").waitFor();
  await page.locator(".mast .lang").getByRole("button", { name: "Es", exact: true }).click();
  const submit = page.getByRole("button", { name: "Enviar Registro" });
  await submit.waitFor();
  check(await page.getByText("Nombre Completo").count() > 0, `register labels switch to Spanish at ${w}`);
  await submit.click();
  await page.waitForTimeout(300);
  check(posts === 0 && (await page.evaluate(() => document.activeElement?.id)) === "field-full_name", `Spanish: empty submit is blocked at ${w}`);
  await page.locator("#field-full_name").fill("Prueba Look");
  await page.locator("#field-email").fill(`look-es-${w}-${Date.now()}@example.test`);
  await page.locator("#field-contribution-other").click();
  const other = page.getByLabel("Otro — especifica");
  await other.fill("Escala móvil");
  check((await other.boundingBox()).height >= 48, `Spanish: the "Otro" input is styled at ${w}`);
  await page.route("**/api/submit/register-2026", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await submit.click();
  const alert = page.getByRole("alert").filter({ hasText: /No pudimos enviar/ });
  await alert.waitFor({ timeout: 10000 });
  check(await alert.isVisible(), `Spanish: a server error is announced at ${w}`);
  await page.unroute("**/api/submit/register-2026");
  await shot(page, `almanac-register-es-${w}`, true);
  await submit.click();
  await page.getByRole("heading", { name: /Gracias por registrarte/ }).waitFor({ timeout: 10000 }).catch(() => {});
  check(await page.getByRole("heading", { name: /Gracias por registrarte/ }).count() > 0, `Spanish: the thank-you shows at ${w}`);
  check(errors.length === 0, `Spanish register: no page errors at ${w}${errors.length ? ` — ${errors[0]}` : ""}`);
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
      // Non-text contrast: every mark's ring against the paper behind it ≥ 3:1, and no mark touches its neighbour.
      const ringRatios = await page.evaluate(() => {
        const rgb = (c) => c.match(/[\d.]+/g).map(Number);
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const paper = lum(rgb(getComputedStyle(document.querySelector(".alm .app")).backgroundColor));
        return [...document.querySelectorAll(".trail__mark .trail__hex")].map((el) => { const l = lum(rgb(getComputedStyle(el).backgroundColor)); return [(Math.max(l, paper) + 0.05) / (Math.min(l, paper) + 0.05), el.parentElement.getAttribute("data-state")]; });
      });
      check(ringRatios.length === 11 && ringRatios.every(([r]) => r >= 3), `row: every mark's ring is ≥3:1 against the page at ${w} (${ringRatios.map(([r, st]) => `${st}:${r.toFixed(1)}`).join(" ")})`);
      const gaps = await page.evaluate(() => { const r = [...document.querySelectorAll(".trail__mark .trail__hex")].map((e) => e.getBoundingClientRect()); return r.slice(1).map((b, i) => b.left - r[i].right); });
      check(gaps.every((g) => g >= 2), `row: no mark touches its neighbour at ${w} (min gap ${Math.min(...gaps).toFixed(1)}px)`);
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
      // Radix hands focus back in a setTimeout(0) after the sheet unmounts, so poll rather than read the instant it detaches.
      const refocused = await opener.evaluate((el) => new Promise((done) => { const end = Date.now() + 2000; const look = () => (el === document.activeElement ? done(true) : Date.now() > end ? done(false) : setTimeout(look, 20)); look(); }));
      check(refocused, `row: focus returns to the trail button at ${w}`);
      await opener.click();
      await page.getByRole("dialog").getByRole("link", { name: /Sunday Oct 18/ }).click();
      await page.waitForURL(/\/calendar\?day=2026-10-18/);
      check(new URL(page.url()).pathname === "/calendar" && new URL(page.url()).searchParams.get("day") === "2026-10-18", `row: a sheet day opens the Calendar for that day at ${w} (${page.url()})`);
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
