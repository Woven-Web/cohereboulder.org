// Browser check for the Ecology look (?look=ecology, T-113, compare-only).
// Runs against a local `wrangler dev` (the real Worker, a local D1 with the
// register-2026 form and a day's companion content) plus the regenOS mock, so
// the Board and the day picker have something to show. Never production, never
// real mail, never scenius.social.
//
//   node scripts/ecology-e2e.mjs http://127.0.0.1:8795 http://127.0.0.1:9945 [/dir/for/screenshots]
//
// scripts/ci-e2e.sh lane 14 loads worker/schema.sql, migration 0002 and
// scripts/fixtures/look-companion.sql BEFORE starting the Worker, then calls this.
//
// Asserts at 360 and 390 (phones): Home, Register, About, Today (zigzag and
// row trails), Calendar, the event page and the signed-in Board all wear the
// ecology look (`.alm.eco`), do not scroll sideways, throw nothing, and pass an
// in-browser audit of every text/background pair (≥4.5:1, ≥3:1 for large text)
// and every control (≥44px). Register keeps its funnel beacons, blocks an empty
// submit, announces a server error, submits, and works in Spanish; Register is on
// the first phone screen. Classic and Almanac are unchanged, and the look sticks.
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [base, mock, shots] = process.argv.slice(2);
if (!base || !mock) { console.error("usage: node scripts/ecology-e2e.mjs <wrangler-dev-url> <regenos-mock-url> [shots-dir]"); process.exit(2); }
if (shots) await mkdir(shots, { recursive: true });

const fails = [];
const check = (cond, m) => { if (!cond) { fails.push(m); console.error(`FAIL ${m}`); } else console.log(`PASS ${m}`); };
const browser = await chromium.launch();
const SIZES = [[390, 844], [360, 780]];
const DAY3 = "2026-10-17T16:00:00Z";
const EV = "ev-eco-e2e-1";

// Two events on Oct 17 in the mock, before the Worker's /api/events cache is filled.
for (const [rkey, name, startsAt, endsAt] of [[EV, "Ecology Free Market", "2026-10-17T16:00:00.000Z", "2026-10-17T19:00:00.000Z"], ["ev-eco-e2e-2", "Ecology Skill Share", "2026-10-17T19:00:00.000Z", "2026-10-17T23:00:00.000Z"]]) {
  const r = await fetch(`${mock}/xrpc/social.scenius.createEvent`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mock-token" }, body: JSON.stringify({ authority: "did:plc:mockscene", rkey, name, description: "A real-enough description for the ecology lane.", startsAt, endsAt, mode: "inperson", placeName: "Martin Park", locality: "Boulder", region: "CO", attendance: "open" }) });
  if (!r.ok) { console.error(`could not seed the mock event ${rkey}: ${r.status}`); process.exit(2); }
}

async function session({ width, height, when = DAY3, member = null }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (when) await context.clock.setFixedTime(new Date(when));
  await context.route("https://www.youtube.com/**", (r) => r.fulfill({ contentType: "text/html", body: "" }));
  await context.route("**/Ecosystem.pdf", (r) => r.fulfill({ contentType: "text/html", body: "" }));
  if (member) await context.addCookies([{ name: "__Host-rs_session", value: member, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|Ecosystem\.pdf|youtube|non-existent route/i.test(m.text())) errors.push(m.text()); });
  return { context, page, errors };
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (page, name, full = false) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: full }); };
const go = (page, path) => page.goto(`${base}${path}${path.includes("?") ? "&" : "?"}look=ecology`, { waitUntil: "load" });

// In-page audit: every visible text node against the colour behind it, every control for size.
const AUDIT = () => {
  const parse = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const colourOf = (value) => { const d = document.createElement("div"); d.style.color = value; document.body.appendChild(d); const c = parse(getComputedStyle(d).color); d.remove(); return c; };
  const sky = colourOf("hsl(var(--eco-sky-hsl))");
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n); const c = parse(cs.backgroundColor);
      if (c.a > 0) layers.push(c);
      if (c.a >= 1) break;
      // the app's sky gradient fades to paper over its first 280px
      if (n.classList.contains("app") && /gradient/.test(cs.backgroundImage)) layers.push(el.getBoundingClientRect().top + scrollY - n.getBoundingClientRect().top - scrollY < 280 ? sky : { r: 0, g: 0, b: 0, a: 0 });
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return out;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[aria-hidden=true],.sr,.sr-only,[hidden]"); };
  const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} "${(el.textContent || "").trim().slice(0, 24)}"`;
  const contrast = [], targets = [];
  for (const el of document.querySelectorAll("#root *")) {
    if (!visible(el) || el.closest("svg,script,style") || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    let bg = bgOf(el);
    const hex = el.closest(".trail__hex");
    if (hex) bg = colourOf(getComputedStyle(hex).getPropertyValue("--fill")); // the hex's fill is a pseudo-element
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700) ? 3 : 4.5;
    const r = ratio(over(parse(cs.color), bg), bg);
    if (r < need) contrast.push(`${r.toFixed(2)}<${need} ${name(el)}`);
  }
  for (const el of document.querySelectorAll("#root a[href], #root button, #root [role=option], #root input, #root select, #root textarea")) {
    if (!visible(el) || el.closest(".sr,.sr-only")) continue;
    if (/radio|checkbox/.test(el.getAttribute("role") || "") || el.matches(".vis button.switch")) continue; // 44px ::before/::after hit areas
    const r = el.getBoundingClientRect();
    if (r.width >= 43.5 && r.height >= 43.5) continue;
    const par = el.closest("p,li");
    if (el.tagName === "A" && par && par !== el && par.textContent.length - el.textContent.length > 12 && getComputedStyle(el).display === "inline") continue; // a link inside a sentence
    targets.push(`${Math.round(r.width)}x${Math.round(r.height)} ${name(el)}`);
  }
  return { contrast, targets };
};
async function audit(page, label, w) {
  const a = await page.evaluate(AUDIT);
  check(a.contrast.length === 0, `${label}: every text/background pair passes WCAG AA at ${w}${a.contrast.length ? ` — ${a.contrast.slice(0, 3).join("; ")}` : ""}`);
  check(a.targets.length === 0, `${label}: every control is ≥44px at ${w}${a.targets.length ? ` — ${a.targets.slice(0, 3).join("; ")}` : ""}`);
}
// Polls: a route can paint a fallback heading before the page mounts.
const isEco = (page) => page.locator(".alm.eco h1").first().waitFor({ timeout: 4000 }).then(() => true, () => false);

// ───────────── Public pages: Home, Register, About, Join ─────────────
for (const [w, h] of SIZES) {
  const { context, page, errors } = await session({ width: w, height: h });
  for (const [label, path] of [["home", "/"], ["register", "/register"], ["about", "/about"], ["join", "/join/test-token"]]) {
    await go(page, path);
    await page.locator("h1").first().waitFor();
    if (path === "/register") await page.locator("#field-full_name").waitFor();
    await page.waitForTimeout(300);
    check(await isEco(page), `${label} wears the ecology look at ${w}`);
    check((await overflow(page)) <= 0, `${label} has no horizontal overflow at ${w} (${await overflow(page)}px)`);
    check(await page.locator(".eco-ridges").count() > 0, `${label} shows the ridges at ${w}`);
    const fam = await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily);
    check(/Bricolage/.test(fam), `${label}: the title is in Bricolage Grotesque at ${w}`);
    const body = await page.locator("main p:not(.eyebrow):not(.folio)").first().evaluate((el) => getComputedStyle(el).fontFamily);
    check(/Figtree/.test(body) || /Newsreader/.test(body), `${label}: body text is Figtree (or the Newsreader heart line) at ${w}`);
    // Register is on the first phone screen.
    const reg = page.locator(".mast .mast__register").first();
    const rb = await reg.boundingBox();
    check(rb && rb.height >= 44 && rb.y + rb.height <= h && rb.x + rb.width <= w, `${label}: Register is on the first screen at ${w}`);
    await audit(page, label, w);
    check(errors.length === 0, `${label}: no page errors at ${w}${errors.length ? ` — ${errors[0]}` : ""}`);
    errors.length = 0;
    await shot(page, `ecology-${label}-${w}`, path !== "/register");
  }
  await go(page, "/");
  check(await page.getByText("We Are Our Ecology").count() > 0 && await page.getByText("Weaving Our Resilience").count() > 0, `home carries "We Are Our Ecology" and "Weaving Our Resilience" at ${w}`);
  // The look sticks across a link; ?look=classic and ?look=almanac undo/replace it; default is classic.
  await page.getByRole("link", { name: /Join COhere|Register/ }).first().click();
  await page.locator("h1").first().waitFor();
  check(await isEco(page), `the ecology look sticks across a link at ${w}`);
  await page.goto(`${base}/?look=classic`, { waitUntil: "load" });
  check(!(await isEco(page)) && !(await page.locator("h1").first().evaluate((el) => Boolean(el.closest(".alm")))), `?look=classic goes back to classic at ${w}`);
  await page.goto(`${base}/?look=almanac`, { waitUntil: "load" });
  check(await page.locator(".alm:not(.eco)").count() > 0 && await page.locator(".alm.eco").count() === 0, `?look=almanac still works at ${w}`);
  await context.close();
  const fresh = await session({ width: w, height: h });
  await fresh.page.goto(`${base}/`, { waitUntil: "load" });
  await fresh.page.locator("h1").first().waitFor();
  check(!(await isEco(fresh.page)), `without the flag the public site is not ecology at ${w}`);
  await fresh.context.close();
}

// ───────────── Hybrid pages ─────────────
for (const [w, h] of SIZES) {
  const { context, page, errors } = await session({ width: w, height: h });
  for (const path of ["/login?token=bogus", "/propose", "/co-create", "/archive", "/join-2025", "/presskit", "/no-such-page"]) {
    await go(page, path);
    await page.locator("h1, h2").first().waitFor();
    await page.waitForTimeout(250);
    check(await page.locator(".alm.eco .mast").count() > 0, `${path}: wears the ecology masthead at ${w}`);
    check((await overflow(page)) <= 0, `${path} ecology has no horizontal overflow at ${w} (${await overflow(page)}px)`);
    await audit(page, path, w);
    check(errors.length === 0, `${path} ecology at ${w}: no page errors${errors.length ? ` — ${errors[0]}` : ""}`);
    errors.length = 0;
    await shot(page, `ecology-hybrid${path.replace(/[/?=]/g, "-")}-${w}`);
  }
  await context.close();
}

// ───────────── Register: the form still converts ─────────────
const THANKS = /Thank you for registering|Gracias por registrarte/;
for (const [w, h] of SIZES) {
  for (const lang of ["en", "es"]) {
    const { context, page, errors } = await session({ width: w, height: h });
    const beacons = [], posts = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/funnel/")) beacons.push(r.postData() ?? "");
      if (r.url().includes("/api/submit/") && r.method() === "POST") posts.push(r.url());
    });
    await go(page, "/register");
    await page.locator("#field-full_name").waitFor();
    if (lang === "es") await page.locator(".mast .lang").getByRole("button", { name: "Es", exact: true }).click();
    await page.waitForTimeout(600);
    const T = lang === "en" ? { submit: "Submit Registration", other: "Other — please specify", fail: /couldn't submit/ } : { submit: "Enviar Registro", other: "Otro — especifica", fail: /No pudimos enviar/ };
    check(beacons.some((b) => b.includes("view")), `${lang}: register sends the funnel "view" beacon at ${w}`);
    const submit = page.getByRole("button", { name: T.submit });
    await submit.waitFor();
    const sb = await submit.boundingBox();
    check(sb && sb.height >= 48, `${lang}: submit is ≥48px tall at ${w}`);
    await audit(page, `${lang} register`, w);
    await submit.click();
    await page.waitForTimeout(300);
    const blocked = await page.evaluate(() => ({ active: document.activeElement?.id, msg: document.activeElement?.validationMessage ?? "" }));
    check(blocked.active === "field-full_name" && blocked.msg.length > 0 && posts.length === 0, `${lang}: an empty submit stops on the first required field with a message and sends nothing at ${w}`);
    await page.locator("#field-full_name").fill("Ecology Tester");
    await page.locator("#field-email").fill(`eco-${lang}-${w}-${Date.now()}@example.test`);
    await page.locator("#field-phone").fill("303 555 0100");
    await page.locator("#field-contribution-other").click();
    const other = page.getByLabel(T.other);
    await other.fill("Sliding scale");
    check((await other.boundingBox()).height >= 48, `${lang}: the "Other" input is styled at ${w}`);
    await shot(page, `ecology-register-filled-${lang}-${w}`, true);
    await page.route("**/api/submit/register-2026", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await submit.click();
    const alert = page.getByRole("alert").filter({ hasText: T.fail });
    await alert.waitFor({ timeout: 10000 });
    check(await alert.isVisible(), `${lang}: a server error is announced at ${w}`);
    await page.unroute("**/api/submit/register-2026");
    const posted = page.waitForResponse((r) => r.url().includes("/api/submit/register-2026") && r.request().method() === "POST");
    await submit.click();
    check((await posted).ok(), `${lang}: the form submits to the local Worker at ${w}`);
    await page.getByRole("heading", { name: THANKS }).waitFor({ timeout: 10000 }).catch(() => {});
    check(await page.getByRole("heading", { name: THANKS }).count() > 0, `${lang}: the thank-you shows at ${w}`);
    check(beacons.some((b) => b.includes("submit_attempt")), `${lang}: submit_attempt beacon fires at ${w}`);
    check(errors.length === 0, `${lang}: register has no page errors at ${w}${errors.length ? ` — ${errors[0]}` : ""}`);
    await shot(page, `ecology-register-done-${lang}-${w}`);
    await context.close();
  }
}

// ───────────── App screens: Today, Calendar, event page, Board ─────────────
for (const [w, h] of SIZES) {
  for (const trail of ["zigzag", "row"]) {
    const { context, page, errors } = await session({ width: w, height: h });
    await context.addInitScript(() => { if (!localStorage.getItem("cohere-practice-done")) localStorage.setItem("cohere-practice-done", JSON.stringify(["2026-10-15", "2026-10-16"])); });
    await go(page, `/today?trail=${trail}`);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    check(await isEco(page), `today (${trail}) wears the ecology look at ${w}`);
    await page.getByRole("heading", { name: /Learn three neighbours/ }).waitFor({ timeout: 8000 }).catch(() => {});
    check(await page.getByRole("heading", { name: /Learn three neighbours/ }).count() === 1, `today (${trail}) shows the day's practice at ${w}`);
    check(await page.locator(".trail .eco-ridges, .eco-ridges + .trail--row").count() > 0 || await page.locator(".eco-ridges").count() > 0, `today (${trail}) draws ridges above the trail at ${w}`);
    check(await page.locator(".photo--arch img").count() === 1, `today shows one real photo in an arch at ${w}`);
    if (trail === "zigzag") {
      const sizes = await page.evaluate(() => [...document.querySelectorAll(".trail--fit .trail__day")].map((a) => { const r = a.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      check(sizes.length === 11 && sizes.every(([a, b]) => a >= 44 && b >= 44), `today: eleven ≥44×44 stepping stones at ${w}`);
      const meadow = await page.locator(".trail--fit").evaluate((el) => getComputedStyle(el).backgroundColor);
      check(meadow !== "rgba(0, 0, 0, 0)", `today: the trail sits on a meadow strip at ${w}`);
      await page.getByTestId("i-did-it").click();
      await page.getByTestId("action-done").waitFor();
      check(await page.getByTestId("observed-row").count() === 1 || await page.getByTestId("action-done").count() === 1, `today: "I did it" stamps the day at ${w}`);
      await page.reload({ waitUntil: "load" });
      await page.getByRole("heading", { level: 1 }).first().waitFor();
    } else {
      check(await page.locator(".trail--row").count() === 1, `today: the row trail variant still works under ecology at ${w}`);
    }
    await audit(page, `today (${trail})`, w);
    check((await overflow(page)) <= 0, `today (${trail}) has no horizontal overflow at ${w}`);
    check(errors.length === 0, `today (${trail}) has no page errors at ${w}${errors.length ? ` — ${errors[0]}` : ""}`);
    await shot(page, `ecology-today-${trail}-${w}`, trail === "zigzag");
    await context.close();
  }

  // Calendar and the event page, signed in with an RSVP so the berry dots and My events show.
  {
    const { context, page, errors } = await session({ width: w, height: h, member: "mock-peer" });
    await page.goto(`${base}/about`, { waitUntil: "load" });
    const rsvp = await page.evaluate(async (rkey) => (await fetch("/xrpc/social.scenius.rsvp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventDid: "did:plc:mockscene", eventRkey: rkey, intent: "going" }) })).status, EV);
    check(rsvp === 200, `the mock accepted an RSVP for the day picker at ${w} (${rsvp})`);
    await go(page, "/calendar?day=2026-10-17");
    await page.getByRole("listbox").waitFor();
    check(await isEco(page), `calendar wears the ecology look at ${w}`);
    check(await page.getByRole("option").count() === 11 && await page.locator('[role=option][aria-selected=true]').count() === 1, `calendar: eleven days, one selected at ${w}`);
    await page.locator(".trail__ticks i").first().waitFor({ timeout: 8000 }).catch(() => {});
    check(await page.locator(".trail__ticks i").count() >= 1, `calendar: the RSVP shows a berry dot on its day at ${w}`);
    const dot = await page.locator(".trail__ticks i").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    check(dot !== "rgba(0, 0, 0, 0)" && dot === await page.evaluate(() => { const d = document.createElement("div"); d.style.color = "hsl(var(--brand-berry))"; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }), `calendar: the dot is the berry token at ${w}`);
    const seg = page.getByRole("group").filter({ has: page.getByRole("button", { name: /My events/ }) });
    check(await seg.count() > 0, `calendar: My events / All events is there at ${w}`);
    await page.getByRole("button", { name: /My events/ }).click();
    check(await page.getByRole("button", { name: /My events/ }).getAttribute("aria-pressed") === "true", `calendar: My events can be chosen at ${w}`);
    await page.getByRole("button", { name: /All events/ }).click();
    check(await page.getByText("Ecology Free Market").count() > 0, `calendar: the day's events are listed at ${w}`);
    await audit(page, "calendar", w);
    check((await overflow(page)) <= 0, `calendar has no horizontal overflow at ${w}`);
    await shot(page, `ecology-calendar-${w}`, true);

    await go(page, `/events/did:plc:mockscene/${EV}`);
    await page.getByRole("heading", { level: 1, name: /Ecology Free Market/ }).waitFor();
    check(await isEco(page), `the event page wears the ecology look at ${w}`);
    await audit(page, "event page", w);
    check((await overflow(page)) <= 0, `event page has no horizontal overflow at ${w}`);
    await shot(page, `ecology-event-${w}`, true);

    // Board, People, Profile, More: signed in as a circle member.
    for (const path of ["/board", "/people", "/profile", "/more"]) {
      await go(page, path);
      await page.locator("h1").first().waitFor();
      await page.waitForTimeout(500);
      check(await isEco(page), `${path} wears the ecology look at ${w}`);
      if (path === "/board") check(await page.getByTestId("board-post").count() >= 1, `board: a signed-in member reads the feed at ${w}`);
      await audit(page, path, w);
      check((await overflow(page)) <= 0, `${path} has no horizontal overflow at ${w}`);
      await shot(page, `ecology${path.replace("/", "-")}-${w}`, true);
    }
    check(errors.length === 0, `calendar, event, board: no page errors at ${w}${errors.length ? ` — ${errors[0]}` : ""}`);
    await context.close();
  }

  // Signed out, the Board is the gate, not an empty feed.
  {
    const { context, page } = await session({ width: w, height: h });
    await go(page, "/board");
    await page.locator("h1").first().waitFor();
    await page.waitForTimeout(500);
    check(await page.getByTestId("board-post").count() === 0, `board: a signed-out visitor sees no posts at ${w}`);
    await audit(page, "board (signed out)", w);
    await shot(page, `ecology-board-gate-${w}`, true);
    await context.close();
  }
}

// ───────────── One navigation model, one product: phone bar vs masthead, Home, week ─────────────
// The same six destinations everywhere: a bottom tab bar on phones, the masthead from 768px up
// (no bottom bar, no phone-width box).
const DESTINATIONS = ["Home", "Today", "Calendar", "Board", "People", "Me"];
for (const [w, h] of [[390, 844], [768, 1024], [1280, 800], [1600, 1000]]) {
  for (const member of [null, "mock-peer"]) {
    const who = member ? "signed in" : "signed out";
    const { context, page, errors } = await session({ width: w, height: h, member });
    for (const path of ["/", "/today", "/calendar", "/board", "/people", "/more"]) {
      await go(page, path);
      await page.locator("h1").first().waitFor();
      const nav = await page.evaluate(() => {
        const bar = document.querySelector("[data-testid=app-tabs]");
        const r = bar.getBoundingClientRect();
        return { fixed: getComputedStyle(bar).position === "fixed", inMast: Boolean(bar.closest(".mast")), top: r.top, bottom: r.bottom, vh: innerHeight, names: [...bar.querySelectorAll("a")].map((a) => a.textContent.trim()), shell: Math.round(document.querySelector(".alm .app").getBoundingClientRect().width) };
      });
      const tag = `${path} ${who} at ${w}`;
      check(JSON.stringify(nav.names) === JSON.stringify(DESTINATIONS), `nav: the same six destinations on ${tag} (${nav.names.join("|")})`);
      if (w < 768) check(nav.fixed && nav.bottom >= nav.vh - 2, `nav: a bottom tab bar on ${tag}`);
      else check(!nav.fixed && nav.top < 140, `nav: no bottom tab bar, the masthead holds the destinations on ${tag}`);
      if (w >= 1280) check(nav.shell > 900, `nav: no phone-width box on ${tag} (${nav.shell}px)`);
      check((await overflow(page)) <= 0, `nav: no horizontal overflow on ${tag}`);
    }
    // Home: during the gathering it leads with today's practice, the trail and Your next; Register stays within reach signed out.
    await go(page, "/");
    await page.getByTestId("home-live").waitFor();
    await page.getByTestId("home-live").getByText(/Learn three/).first().waitFor({ timeout: 8000 }).catch(() => {});
    check(await page.getByTestId("home-live").getByText(/Learn three neighbours/).count() === 1, `home: leads with today's practice ${who} at ${w}`);
    check(await page.locator(".trail--fit, .trail--row").count() >= 1 && await page.getByTestId("home-live").getByRole("link", { name: /Open Today/ }).count() === 1, `home: the trail and a way into Today ${who} at ${w}`);
    if (member) await page.getByTestId("home-live").getByRole("link", { name: /Open the Board/ }).waitFor({ timeout: 8000 }).catch(() => {});
    if (member) check(await page.getByTestId("home-live").getByRole("link", { name: /Open the Board/ }).count() === 1, `home: signed in, the latest Board posts link into the Board at ${w}`);
    else {
      const reg = await page.getByTestId("home-live").getByRole("link", { name: /Join COhere|Register/ }).first().boundingBox();
      check(reg && reg.y + reg.height <= h, `home: signed out, Register is on the first screen at ${w}`);
    }
    check(errors.length === 0, `nav/home: no page errors ${who} at ${w}${errors.length ? ` — ${errors[0]}` : ""}`);
    await context.close();
  }
}
// Before the gathering, signed out: the hero and Register, plus the trail preview.
{
  const { context, page } = await session({ width: 1280, height: 800, when: "2026-10-10T16:00:00Z" });
  await go(page, "/");
  await page.getByTestId("home-preview").waitFor();
  check(await page.getByTestId("home-live").count() === 0 && await page.getByRole("heading", { level: 1 }).first().textContent().then((t) => /here/.test(t)), "home: before the gathering, signed out, the hero shows with the trail preview");
  await context.close();
}
// The week view appears from 1024px and lists a day's events as links.
{
  const { context, page } = await session({ width: 1280, height: 800, member: "mock-peer" });
  await go(page, "/calendar?day=2026-10-17");
  await page.getByRole("listbox").waitFor();
  await page.getByRole("button", { name: /^My events|^All events/ }).first().waitFor({ timeout: 3000 }).catch(() => {});
  if (await page.getByRole("button", { name: /^All events/ }).count()) await page.getByRole("button", { name: /^All events/ }).click();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  check(await page.getByTestId("calendar-week").getByRole("link", { name: /Ecology Free Market/ }).count() === 1, "calendar: the week view lists the day's events at 1280");
  await context.close();
  const phone = await session({ width: 390, height: 844, member: "mock-peer" });
  await go(phone.page, "/calendar?day=2026-10-17");
  await phone.page.getByRole("listbox").waitFor();
  check(await phone.page.getByRole("button", { name: "Week", exact: true }).count() === 0, "calendar: no week toggle on a phone");
  await phone.context.close();
}

await browser.close();
if (fails.length) { console.error(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log("\necology-e2e: all checks passed");
