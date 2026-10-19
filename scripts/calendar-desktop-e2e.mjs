// Browser check for the Calendar on a laptop (T: calendar and desktop fixes, 10-16).
// Runs against a local `wrangler dev` plus the regenOS mock (scripts/calendar-desktop-e2e.sh starts both).
// Never production, never real mail, never scenius.social.
//
//   node scripts/calendar-desktop-e2e.mjs http://127.0.0.1:8795 http://127.0.0.1:9945 [/dir/for/screenshots]
//
// Asserts, under the ecology look with the browser clock fixed to Oct 16 noon in Boulder:
//  - a day picked from the trail, or from the week's header, shows that day, and on a laptop the
//    right-hand panel switches to Day (not Week); the stored Week choice is untouched
//  - Oct 15 (yesterday's opening) is reachable: its events are listed, marked Ended, with no RSVP
//    button, open to the event page, and a member can share a harvest there
//  - All events / My events is one toggle over the same day's list, All by default, and says what is shown
//  - the day list and the week never scroll sideways and no text overflows its block, at 1280, 1440, 1024 and 390
//  - Day / Week is kept in the URL (?view=), so a reload shows the same view
//  - week titles break between words only (a word too long for its chip ends in "…"), beside Your next at 1280
//  - first paint: layout shift under 0.1 at 390 and 1280, and a returning member's masthead and host card
//    never show the signed-out words ("Join COhere", "About", "Sign in") while the session is read
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { LONG, seedEvents } from "./calendar-desktop-seed.mjs";

const [base, mock, shots] = process.argv.slice(2);
if (!base || !mock) { console.error("usage: node scripts/calendar-desktop-e2e.mjs <wrangler-dev-url> <regenos-mock-url> [shots-dir]"); process.exit(2); }
if (shots) await mkdir(shots, { recursive: true });

const fails = [];
const check = (cond, m) => { if (!cond) { fails.push(m); console.error(`FAIL ${m}`); } else console.log(`PASS ${m}`); };
const browser = await chromium.launch();
const NOON = "2026-10-16T18:00:00Z"; // Fri Oct 16, 12:00 in Boulder

await seedEvents(mock);

async function session({ width, height, member = null }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.clock.setFixedTime(new Date(NOON));
  await context.route("https://www.youtube.com/**", (r) => r.fulfill({ contentType: "text/html", body: "" }));
  if (member) await context.addCookies([{ name: "__Host-rs_session", value: member, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|youtube|non-existent route/i.test(m.text())) errors.push(m.text()); });
  return { context, page, errors };
}
const go = (page, path) => page.goto(`${base}${path}${path.includes("?") ? "&" : "?"}look=ecology`, { waitUntil: "load" });
const shot = async (page, name, full = false) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: full }); };
const pageOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
// Names what overflows its own block: a box whose content is wider than it is, or a child poking out of its event card.
const textOverflow = (page, rootSel) => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  if (!root) return ["no root"];
  const out = [];
  const name = (e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)} "${(e.textContent || "").trim().slice(0, 24)}"`;
  for (const el of root.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.display === "contents") continue;
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "hidden" && cs.overflowX !== "clip") out.push(`wide ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    const card = el.closest(".ev, .week__ev");
    if (card && card !== el) {
      const a = card.getBoundingClientRect(), b = el.getBoundingClientRect();
      if (b.width && (b.right > a.right + 1 || b.left < a.left - 1)) out.push(`out ${name(el)}`);
    }
  }
  return out.slice(0, 6);
}, rootSel);
const trailDay = (page, d) => page.getByRole("option", { name: new RegExp(`^\\w+day Oct ${d}`) });
const dayHeading = (page, text) => page.locator(".agenda-head h2", { hasText: text });

// ───────────── Laptops: 1280 and 1440, signed out ─────────────
for (const [w, h] of [[1280, 800], [1440, 900]]) {
  const { context, page, errors } = await session({ width: w, height: h });
  await go(page, "/calendar");
  await page.getByTestId("calendar-week").waitFor({ timeout: 8000 });
  check(await page.getByTestId("calendar-week").count() === 1, `the laptop opens on the Week at ${w}`);
  check(await page.locator(".week__ev").first().isVisible(), `the week lists events at ${w}`);
  check((await textOverflow(page, "[data-testid=calendar-week]")).length === 0, `week: no text overflows its chip at ${w} ${await textOverflow(page, "[data-testid=calendar-week]")}`);
  await shot(page, `week-${w}`, true);

  await trailDay(page, 17).click();
  await dayHeading(page, "October 17").waitFor({ timeout: 5000 });
  check(await page.getByTestId("calendar-week").count() === 0, `picking a day in the trail swaps the Week for that day at ${w}`);
  check(await page.getByRole("button", { name: "Day", exact: true }).getAttribute("aria-pressed") === "true", `Day is the pressed view after picking a day at ${w}`);
  check(new URL(page.url()).searchParams.get("day") === "2026-10-17", `the URL names the picked day at ${w}`);
  check(await page.getByText("Desktop Free Market").count() > 0 && await page.getByText("Desktop Skill Share").count() > 0, `the picked day lists its events at ${w}`);
  check(await page.getByText("Opening Invocation").count() === 0, `the picked day lists only its own events at ${w}`);
  check(await page.evaluate(() => localStorage.getItem("cohere.calendar.view")) === null, `picking a day does not overwrite the stored view choice at ${w}`);
  check((await pageOverflow(page)) <= 0, `day view: no horizontal overflow at ${w} (${await pageOverflow(page)}px)`);
  const over = await textOverflow(page, ".cal-list");
  check(over.length === 0, `day view: no text overflows its block at ${w}${over.length ? ` — ${over.join("; ")}` : ""}`);
  await shot(page, `day-${w}`, true);

  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByTestId("calendar-week").waitFor();
  check(await page.evaluate(() => localStorage.getItem("cohere.calendar.view")) === "week", `choosing Week sticks at ${w}`);
  await page.locator(".week__head", { hasText: "15" }).click();
  await dayHeading(page, "October 15").waitFor({ timeout: 5000 });
  check(await page.getByTestId("calendar-week").count() === 0, `a week header opens that day in Day view at ${w}`);

  // Yesterday: the opening is there, marked past, with harvests in place of RSVP.
  const card = page.getByTestId("event-card", { exact: false }).filter({ hasText: "Opening Invocation" });
  check(await card.count() === 1, `yesterday (Oct 15) lists the opening at ${w}`);
  check(await card.getByTestId("ev-ended").count() === 1, `a past event is marked Ended at ${w}`);
  check(await card.getByTestId("card-rsvp").count() === 0, `a past event has no RSVP button at ${w}`);
  check(await card.getByTestId("card-harvests").count() === 1, `a past event links to its harvests at ${w}`);
  await shot(page, `past-day-${w}`, true);
  check((await textOverflow(page, ".cal-list")).length === 0, `past day: no text overflow at ${w}`);

  await trailDay(page, 17).click();
  await dayHeading(page, "October 17").waitFor();
  check(await page.getByTestId("event-card").filter({ hasText: "Desktop Free Market" }).getByTestId("card-rsvp").count() === 1, `a future event keeps its RSVP button at ${w}`);
  check(errors.length === 0, `calendar at ${w}: no page errors${errors.length ? ` — ${errors[0]}` : ""}`);
  await context.close();
}

// ───────────── Day / Week in the URL ─────────────
{
  const { context, page, errors } = await session({ width: 1280, height: 800 });
  const viewNow = async () => ((await page.getByTestId("calendar-week").count()) ? "week" : "day");
  const forgetStoredView = () => page.evaluate(() => localStorage.removeItem("cohere.calendar.view"));
  await go(page, "/calendar?day=2026-10-17");
  await dayHeading(page, "October 17").waitFor({ timeout: 8000 });
  check(await viewNow() === "day", "a link with ?day= alone opens that day in Day view");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByTestId("calendar-week").waitFor();
  const picked = new URL(page.url()).searchParams;
  check(picked.get("view") === "week" && picked.get("day") === "2026-10-17", `picking Week puts it in the URL, with the day (${page.url().replace(base, "")})`);
  // Only the URL may carry it across the reload.
  await forgetStoredView(); await page.reload({ waitUntil: "load" });
  await page.locator(".cal-view").waitFor({ timeout: 8000 });
  check(await viewNow() === "week", "a reload after picking Week shows the Week");
  check(await page.getByRole("button", { name: "Week", exact: true }).getAttribute("aria-pressed") === "true", "Week is the pressed view after the reload");
  // (Without the fix the reload showed the Day; switch to the Week so the rest still runs.)
  if (await viewNow() !== "week") { await page.getByRole("button", { name: "Week", exact: true }).click(); await page.getByTestId("calendar-week").waitFor(); }
  await page.getByTestId("week-step").click();
  check(new URL(page.url()).searchParams.get("view") === "week" && await viewNow() === "week", "stepping to the other week keeps Week in the URL");
  await page.getByRole("button", { name: "Day", exact: true }).click();
  check(new URL(page.url()).searchParams.get("view") === "day", "picking Day puts it in the URL");
  await forgetStoredView(); await page.reload({ waitUntil: "load" });
  await page.locator(".cal-view").waitFor({ timeout: 8000 });
  check(await viewNow() === "day", "a reload after picking Day shows the Day");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByTestId("calendar-week").waitFor();
  // (The second week is showing now: Oct 22–25.)
  if (!(await page.locator(".week__head", { hasText: "22" }).count())) await page.getByTestId("week-step").click();
  await page.locator(".week__head", { hasText: "22" }).click();
  await dayHeading(page, "October 22").waitFor({ timeout: 5000 });
  check(await viewNow() === "day" && new URL(page.url()).searchParams.get("view") === null, "a week header still opens that day in Day view, and the URL says so");
  check(errors.length === 0, `view in the URL: no page errors${errors.length ? ` — ${errors[0]}` : ""}`);
  await context.close();
}

// ───────────── First paint: no layout shift, and no signed-out words for a returning member ─────────────
const watchFirstPaint = (context) => context.addInitScript(() => {
  window.__cls = 0; window.__mast = []; window.__host = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch { /* no API */ }
  const seen = (el) => el && el.checkVisibility?.({ visibilityProperty: true }) !== false;
  const note = (list, text) => { if (list.at(-1) !== text) list.push(text); };
  new MutationObserver(() => {
    const end = document.querySelector(".mast__end");
    if (end) note(window.__mast, [...end.querySelectorAll("a,button,[role=status]")].filter((el) => !el.closest(".lang") && seen(el)).map((el) => el.textContent.trim()).filter(Boolean).join(" | "));
    const host = document.querySelector("[data-testid=calendar-host]");
    note(window.__host, host && seen(host) ? host.innerText.replace(/\s+/g, " ").trim() : "");
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
});
for (const [w, h] of [[390, 844], [1280, 800]]) {
  for (const member of [null, "mock-peer"]) {
    const who = member ? "a returning member" : "a visitor";
    const { context, page } = await session({ width: w, height: h, member });
    // A member has been here before on this device (that is how the session cookie got here).
    if (member) {
      await go(page, "/about");
      // ...and the site remembered that this device was signed in.
      check(await page.waitForFunction(() => localStorage.getItem("cohere.signedIn") === "1", null, { timeout: 8000 }).then(() => true, () => false), `at ${w}, a member's visit leaves the signed-in hint on the device`);
    }
    await watchFirstPaint(context);
    // The session answer takes a real round trip.
    await page.route("**/xrpc/social.scenius.getSession", async (r) => { await new Promise((ok) => setTimeout(ok, 600)); await r.continue(); });
    await go(page, "/calendar");
    await page.locator("[data-testid=calendar-host], main .bg-paper-3").first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(1500);
    const { cls, mast, host } = await page.evaluate(() => ({ cls: window.__cls, mast: window.__mast, host: window.__host }));
    check(cls < 0.1, `first paint at ${w}, ${who}: layout shift ${cls.toFixed(4)} is under 0.1`);
    if (member) {
      const said = mast.filter((t) => /Join COhere|Sign in|\bAbout\b/.test(t));
      check(said.length === 0, `first paint at ${w}: the masthead never shows ${who} the signed-out words${said.length ? ` — ${said.join(" / ")}` : ""}`);
      const hostSaid = host.filter((t) => /need an account|Have an account|Sign in/i.test(t));
      check(hostSaid.length === 0, `first paint at ${w}: the host card never shows ${who} the signed-out wording${hostSaid.length ? ` — ${hostSaid[0].slice(0, 60)}` : ""}`);
      // The RSVP lookups are one regenOS call per upcoming event. Slow them right down: the device's
      // remembered answers lay the page out at once, and the list doesn't wait for the lookups.
      check(await page.evaluate(() => Boolean(localStorage.getItem("cohere.mySeats.v1"))), `at ${w}, the member's RSVP answers are remembered on the device`);
      await page.route("**/xrpc/social.scenius.getEventAttendance*", async (r) => { await new Promise((ok) => setTimeout(ok, 3000)); await r.continue().catch(() => {}); });
      const t0 = Date.now();
      await go(page, "/calendar");
      await page.getByTestId("your-next").waitFor({ timeout: 10000 });
      const seenAfter = Date.now() - t0;
      await page.waitForTimeout(3500);
      const slow = await page.evaluate(() => window.__cls);
      check(seenAfter < 2500, `at ${w}, with slow lookups, a returning member sees Your next from the remembered answers (${seenAfter} ms)`);
      check(slow < 0.1, `at ${w}, with slow lookups, layout shift ${slow.toFixed(4)} is under 0.1`);
      // A device that remembers nothing waits about a second for the lookups, then shows the list without them.
      // (Off the calendar first, so its last lookup can't write the answers back as we clear them.)
      await go(page, "/about");
      await page.evaluate(() => localStorage.removeItem("cohere.mySeats.v1"));
      const t1 = Date.now();
      await go(page, "/calendar");
      await page.locator(".agenda-head, .daygroup, [data-testid=calendar-week]").first().waitFor({ timeout: 10000 });
      const listAfter = Date.now() - t1;
      const lookupsLeft = await page.getByTestId("your-next").count() === 0;
      check(listAfter < 2800 && lookupsLeft, `at ${w}, with slow lookups and nothing remembered, the list still shows in ${listAfter} ms, before the lookups end`);
      // Every lookup is 3 s and they go four at a time: wait for the last of them.
      await page.getByTestId("your-next").waitFor({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
      console.log(`  (at ${w}, nothing remembered and slow lookups: layout shift ${(await page.evaluate(() => window.__cls)).toFixed(4)} once they land)`);
    }
    await context.close();
  }
}

// ───────────── The day list at 1024 and 390, and at 1280 in a wide fallback face ─────────────
for (const [w, h, wide] of [[1024, 768, false], [390, 844, false], [1280, 800, true]]) {
  const { context, page } = await session({ width: w, height: h });
  if (wide) await context.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = "*{font-family:'DejaVu Sans',Verdana,sans-serif !important;letter-spacing:.03em}"; document.head.append(st); }); });
  await go(page, "/calendar?day=2026-10-17");
  await page.getByRole("listbox").waitFor();
  if (w >= 1024) { await page.getByRole("button", { name: "Day", exact: true }).click(); }
  await dayHeading(page, "October 17").waitFor({ timeout: 8000 });
  check(await page.getByText(LONG.slice(0, 20)).count() > 0, `the long-titled event is listed at ${w}${wide ? " (wide face)" : ""}`);
  check((await pageOverflow(page)) <= 0, `day view: no horizontal overflow at ${w}${wide ? " (wide face)" : ""} (${await pageOverflow(page)}px)`);
  const over = await textOverflow(page, ".cal-list");
  check(over.length === 0, `day view: no text overflows its block at ${w}${wide ? " (wide face)" : ""}${over.length ? ` — ${over.join("; ")}` : ""}`);
  if (w === 390) {
    await trailDay(page, 15).click();
    await dayHeading(page, "October 15").waitFor();
    check(await page.getByText("Opening Invocation").count() > 0, "phone: a picked past day lists its events (390)");
    await shot(page, "past-day-390", true);
  }
  await shot(page, `day-${w}${wide ? "-wide" : ""}`, true);
  await context.close();
}

// ───────────── A member: harvests on yesterday's event, and All / My events ─────────────
for (const [w, h] of [[1280, 800]]) {
  const { context, page, errors } = await session({ width: w, height: h, member: "mock-peer" });
  await page.goto(`${base}/about`, { waitUntil: "load" });
  const rsvp = await page.evaluate(async () => (await fetch("/xrpc/social.scenius.rsvp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventDid: "did:plc:mockscene", eventRkey: "cd-market", intent: "going" }) })).status);
  check(rsvp === 200, `the mock accepted an RSVP (${rsvp})`);
  await go(page, "/calendar?day=2026-10-17");
  await page.getByTestId("my-events-toggle").waitFor({ timeout: 8000 });
  const all = page.getByRole("button", { name: /^All events/ }), mine = page.getByRole("button", { name: /^My events/ });
  check(await all.getAttribute("aria-pressed") === "true" && await mine.getAttribute("aria-pressed") === "false", "All events is the default, not My events");
  check((await page.getByTestId("event-card").count()) >= 3, "All events lists every event of the day");
  check(/All events/.test(await page.getByTestId("agenda-count").innerText()), "the heading says All events is showing");
  const allCount = await page.getByTestId("event-card").count();
  await mine.click();
  // Not "exactly one": MOCK_NOTIFY's just-ended events (Pia is seated on them) sit on whatever day the
  // lane runs, so on Oct 17 one of them is on this day too. What matters: hers stay, the others go.
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid=event-card]').length < n, allCount);
  check(await page.getByText("Desktop Free Market").count() > 0 && await page.getByText("Desktop Skill Share").count() === 0, "My events narrows the same day to the events you RSVP'd to");
  check(/My events/.test(await page.getByTestId("agenda-count").innerText()), "the heading says My events is showing");
  check(new URL(page.url()).searchParams.get("day") === "2026-10-17", "My events keeps the same day");
  await shot(page, "mine-1280", true);
  // Pick another day while My events is on: still that day, still filtered, with a plain empty line.
  await trailDay(page, 15).click();
  await dayHeading(page, "October 15").waitFor();
  check(await mine.getAttribute("aria-pressed") === "true", "picking a day keeps My events selected");
  check(await page.getByTestId("event-card").count() === 0 && await page.getByText("None of yours.").count() === 1, "an empty My-events day says so and lists nothing");
  await all.click();
  check(await page.getByTestId("event-card").filter({ hasText: "Opening Invocation" }).count() === 1, "All events brings the day's full list back");

  // The week beside Your next: the narrowest the week gets on a laptop.
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByTestId("calendar-week").waitFor({ timeout: 8000 });
  await page.getByTestId("your-next").waitFor({ timeout: 8000 });
  const titles = await page.$$eval(".week__ev b", (els) => els.map((b) => {
    const node = b.firstChild; const broken = []; let i = 0;
    for (const word of b.textContent.split(" ")) {
      if (node && word) {
        const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + word.length);
        if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) broken.push(word);
      }
      i += word.length + 1;
    }
    return { text: b.textContent, broken, cut: b.scrollWidth > b.clientWidth + 1, ellipsis: getComputedStyle(b).textOverflow === "ellipsis" };
  }));
  const broken = titles.filter((t) => t.broken.length);
  check(titles.length > 0 && broken.length === 0, `week beside Your next: no title breaks inside a word${broken.length ? ` — ${broken.map((t) => t.broken.join(",")).join("; ")}` : ""}`);
  check(titles.filter((t) => t.cut).every((t) => t.ellipsis), "week beside Your next: a word too long for its chip ends in an ellipsis");
  check(titles.some((t) => t.text === LONG && t.cut), "week beside Your next: the over-long word is cut, not split");
  await shot(page, "week-beside-your-next-1280");
  await go(page, "/calendar?day=2026-10-15");
  await dayHeading(page, "October 15").waitFor({ timeout: 8000 });

  // Yesterday's event page: harvests open to a member, and a harvest can be added.
  await page.getByRole("link", { name: "Harvests" }).first().click();
  await page.getByTestId("harvest-section").waitFor({ timeout: 8000 });
  check(await page.getByTestId("harvest-section").getAttribute("data-state") === "open", "a member sees the harvest section open on yesterday's event");
  await page.getByTestId("harvest-composer").waitFor();
  await page.locator("#hv-t").fill("The creek was loud and the circle was quiet.");
  await shot(page, "past-event-harvest-1280", true);
  await page.getByTestId("harvest-share").click();
  await page.getByTestId("harvest-mine").waitFor({ timeout: 8000 });
  check(await page.getByTestId("harvest-mine").innerText().then((t) => /creek was loud/.test(t)), "a harvest can be added to yesterday's event");
  check(await page.getByTestId("card-rsvp").count() === 0, "the past event page offers no RSVP");
  check(errors.length === 0, `member calendar: no page errors${errors.length ? ` — ${errors[0]}` : ""}`);
  await context.close();
}

// ───────────── Signed out, the event page of a past event ─────────────
{
  const { context, page } = await session({ width: 1280, height: 800 });
  await go(page, "/calendar?day=2026-10-15");
  await page.getByRole("link", { name: "Opening Invocation" }).first().click();
  await page.getByRole("heading", { level: 1, name: "Opening Invocation" }).waitFor();
  await page.getByTestId("harvest-section").waitFor({ timeout: 8000 });
  check(await page.getByTestId("harvest-section").getAttribute("data-state") === "signed-out", "signed out, a past event shows the harvest gate, not an RSVP");
  await context.close();
}

await browser.close();
if (fails.length) { console.error(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log("\nall calendar-desktop checks passed");
