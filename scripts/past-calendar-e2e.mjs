// Browser check for the calendar after the festival (T-399). Runs against a local `wrangler dev` plus
// the regenOS mock as appview and PDS (scripts/past-calendar-e2e.sh starts both). Never production.
//
//   node scripts/past-calendar-e2e.mjs http://127.0.0.1:8795 nothing-upcoming|upcoming [/dir/for/screenshots]
//
// nothing-upcoming: the page looks back at the festival instead of going blank. Its events are listed
// by day on a phone and in the week grid on a laptop, with no RSVP, "Ended" or host control; every
// event opens; home looks back too; a signed-in member's page asks regenOS for no seats.
// upcoming: what is upcoming comes first on both, and the festival stays reachable below it.
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [base, mode, shots] = process.argv.slice(2);
if (!base || !mode) { console.error("usage: node scripts/past-calendar-e2e.mjs <wrangler-dev-url> nothing-upcoming|upcoming [shots-dir]"); process.exit(2); }
if (shots) await mkdir(shots, { recursive: true });

const fails = [];
const check = (cond, m) => { if (!cond) { fails.push(m); console.error(`FAIL ${m}`); } else console.log(`PASS ${m}`); };
const browser = await chromium.launch();
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const REAL = ["The Mock Invocation (Opening)", "Honoring the Creek", "Mindful Birding", "Free Market", "Skill Share Fest", "Film Night", "Be More Like Trees", "Writer's Block Jam", "Social Stitchers", "Community Song Circle", "The Mock Integration (Closing)"];
const HIDDEN = ["TEST", "test", "The Called-Off Picnic", "Not On The Appview"];
const TITLE = "COhere 2026 happened Oct 15–25";

async function open(viewport, { look = "ecology", cookie, lang } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  if (cookie) await context.addCookies([{ name: "__Host-rs_session", value: cookie, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  await context.addInitScript(([l, g]) => {
    try { localStorage.setItem("cohere-look", l); if (g) localStorage.setItem("cohere-language", g); } catch { /* opaque frame */ }
  }, [look, lang]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}
const shot = async (page, name, fullPage = false) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage }); };
const go = async (page, path) => { await page.goto(`${base}${path}`); await page.waitForLoadState("networkidle"); };
const titles = (page) => page.locator("[data-testid=event-card] .ev__title a").allTextContents();
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

const api = await (await fetch(`${base}/api/events?past=1`)).json();
const names = api.events.map((e) => e.name);
check(REAL.every((n) => names.includes(n)), `/api/events?past=1 walks every PDS page: ${names.length} events`);
check(!HIDDEN.some((n) => names.includes(n)), "the API keeps out TEST, cancelled and the record the appview doesn't list");
for (const e of api.events.filter((x) => REAL.includes(x.name))) {
  const res = await fetch(`${base}/api/events/${encodeURIComponent(e.did)}/${encodeURIComponent(e.rkey)}`);
  if (!res.ok) check(false, `detail for ${e.name} answered ${res.status}`);
}
check((await fetch(`${base}/api/events/${encodeURIComponent("did:plc:mockscene")}/ev-called-off`)).status === 404, "a cancelled record has no detail page");

if (mode === "nothing-upcoming") {
  check((await (await fetch(`${base}/api/events`)).json()).events.length === 0, "the plain listing still says nothing is upcoming");

  // ---------------------------------------------------------------- phone
  {
    const { context, page, errors } = await open(PHONE);
    await go(page, "/calendar");
    check(await page.getByRole("heading", { name: TITLE }).isVisible(), "phone: the warm heading is there");
    check(await page.locator("iframe").count() === 0, "phone: no Luma embed in place of the festival");
    check(await page.locator("[data-testid=calendar-week]").count() === 0, "phone: a list by day, not the week grid");
    const list = await titles(page);
    check(REAL.every((n) => list.includes(n)) && !HIDDEN.some((n) => list.includes(n)), `phone: every real event is listed and nothing else (${list.length})`);
    check(list.indexOf("The Mock Invocation (Opening)") === 0 && list.at(-1) === "The Mock Integration (Closing)", "phone: runs from the opening to the close");
    check(await page.locator("[data-testid=card-rsvp]").count() === 0, "phone: no RSVP buttons");
    check(await page.locator("[data-testid=ev-ended]").count() === 0, "phone: no row is stamped Ended");
    check(await page.locator("[data-testid=card-harvests]").count() === 0, "phone: signed out, no row leads to the members' gate");
    check(await noOverflow(page), "phone: no sideways scroll");
    await shot(page, "01-calendar-phone");
    await shot(page, "01-calendar-phone-full", true);

    await page.getByRole("option", { name: /Oct 17/ }).click();
    await page.waitForFunction(() => document.querySelectorAll("[data-testid=event-card]").length === 3);
    check((await titles(page)).join() === "Mindful Birding,Free Market,Skill Share Fest", "phone: picking Oct 17 shows that day");
    check(await page.getByRole("heading", { name: TITLE }).isVisible(), "phone: the heading stays while browsing a day");
    await shot(page, "02-calendar-phone-day");

    await page.getByRole("link", { name: "Skill Share Fest" }).click();
    await page.getByRole("heading", { level: 1, name: "Skill Share Fest" }).waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    check(await page.getByRole("heading", { level: 1, name: "Skill Share Fest" }).isVisible(), "phone: a past event opens");
    check(await page.getByText("A second paragraph, with more about the evening.").isVisible(), "phone: its description reads");
    check(await page.getByText("The Grange").first().isVisible(), "phone: its place reads");
    check(await page.locator("[data-testid=event-rsvp]").count() === 0, "phone: no RSVP form on a past event");
    check(await noOverflow(page), "phone: the event page has no sideways scroll");
    await shot(page, "03-event-phone");
    await page.locator("main").getByRole("link", { name: /Calendar/ }).first().click();
    await page.getByRole("heading", { name: TITLE }).waitFor({ timeout: 8000 }).catch(() => {});
    check(await page.getByRole("heading", { name: TITLE }).isVisible(), "phone: the way back works");
    check(errors.length === 0, `phone: no page errors ${errors.join("; ")}`);
    await context.close();
  }

  // -------------------------------------------------------------- laptop
  {
    const { context, page, errors } = await open(DESK);
    await go(page, "/calendar");
    check(await page.locator("[data-testid=calendar-week]").isVisible(), "laptop: the week grid is the default");
    check((await page.locator(".week__bar .mono").textContent()).includes("Oct 15"), "laptop: the grid lands on the festival's first week");
    const chips = page.locator("[data-testid=calendar-week] a.week__ev");
    check((await chips.count()) === 8, `laptop: the first week's events are in the grid (${await chips.count()})`);
    check(await page.locator(".week__ev[data-past]").count() === 0, "laptop: no chip is drawn as lapsed");
    check(await noOverflow(page), "laptop: no sideways scroll");
    await shot(page, "04-calendar-desktop");
    await page.getByTestId("week-step").click();
    check((await page.locator(".week__bar .mono").textContent()).includes("Oct 22"), "laptop: the second week is a step away");
    // 03:00 UTC on Oct 22 is the evening of Oct 21 in Boulder, so the jam sits in the first week.
    check((await chips.count()) === 3, `laptop: the second week's events are in the grid (${await chips.count()})`);
    await shot(page, "05-calendar-desktop-week2");
    await page.getByTestId("week-step").click();
    await page.getByRole("button", { name: "Month view" }).click();
    check(await page.getByRole("heading", { name: /October 2026/i }).isVisible(), "laptop: the month view opens on October");
    await shot(page, "06-calendar-desktop-month", true);
    await chips.first().click();
    await page.getByRole("heading", { level: 1, name: "The Mock Invocation (Opening)" }).waitFor({ timeout: 8000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    check(await page.getByRole("heading", { level: 1, name: "The Mock Invocation (Opening)" }).isVisible(), "laptop: a chip opens its event");
    await shot(page, "07-event-desktop");
    check(errors.length === 0, `laptop: no page errors ${errors.join("; ")}`);
    await context.close();
  }

  // ------------------------------------------------- every link, every look
  for (const look of ["classic", "almanac"]) {
    const { context, page } = await open(PHONE, { look });
    await go(page, "/calendar");
    check(await page.getByRole("heading", { name: TITLE }).isVisible(), `${look}: the heading is there`);
    check((await titles(page)).length === REAL.length, `${look}: every event is listed`);
    await context.close();
  }
  {
    const { context, page } = await open(PHONE, { lang: "es" });
    await go(page, "/calendar");
    check(await page.getByRole("heading", { name: "COhere 2026 fue del 15 al 25 de octubre" }).isVisible(), "Spanish: the heading is translated");
    await context.close();
  }

  // ---------------------------------------------------------------- home
  for (const look of ["ecology", "classic"]) {
    const { context, page } = await open(PHONE, { look });
    await go(page, "/");
    const band = page.getByTestId("home-happened");
    check(await band.isVisible(), `home (${look}): looks back at the festival`);
    check(await band.locator("[data-testid=card-rsvp]").count() === 0, `home (${look}): no RSVP on a past event`);
    const links = await band.locator('a[href^="/events/"]').allTextContents();
    check(links.some((t) => t.includes("Opening")) && links.some((t) => t.includes("Closing")), `home (${look}): picks run from the opening to the close`);
    if (look === "ecology") {
      await band.scrollIntoViewIfNeeded();
      await shot(page, "08-home-phone");
      await band.getByRole("link", { name: "See what happened" }).click();
      await page.getByRole("heading", { name: TITLE }).first().waitFor({ timeout: 8000 }).catch(() => {});
      check(new URL(page.url()).pathname === "/calendar", "home: See what happened goes to the calendar");
    }
    await context.close();
  }

  // ------------------------------------------- a member's page stays quiet
  {
    const { context, page } = await open(PHONE, { cookie: "sess-member" });
    const seatCalls = [];
    page.on("request", (r) => { if (r.url().includes("getEventAttendance")) seatCalls.push(r.url()); });
    await go(page, "/calendar");
    check((await titles(page)).length === REAL.length, "member: every event is listed");
    check(seatCalls.length === 0, `member: no seat lookups for rows that are over (${seatCalls.length})`);
    check(await page.getByRole("button", { name: /^Edit/ }).count() === 0, "member: no host controls on the look back");
    check(await page.locator("[data-testid=card-harvests]").count() === REAL.length, "member: each row offers its harvests");
    await page.locator("[data-testid=card-harvests]").first().click();
    await page.getByRole("heading", { level: 1, name: "The Mock Invocation (Opening)" }).waitFor({ timeout: 8000 }).catch(() => {});
    check(new URL(page.url()).pathname.endsWith("ev-opening"), "member: the harvests link opens the event");
    // The appview no longer knows this event, so this only works if the write reads the repo too.
    await page.getByTestId("harvest-composer").waitFor({ timeout: 8000 });
    await page.waitForLoadState("networkidle");
    check(await page.getByTestId("harvest-didnt-rsvp").count() === 0, "member: no claim they didn't RSVP when regenOS can't say");
    await page.locator("#hv-t").fill("The opening stayed with me.");
    await page.getByTestId("harvest-share").click();
    await page.getByTestId("harvest-mine").waitFor({ timeout: 8000 }).catch(() => {});
    check(await page.getByTestId("harvest-mine").isVisible(), "member: a harvest can be shared on a festival event");
    await context.close();
  }
}

if (mode === "upcoming") {
  for (const [label, viewport] of [["phone", PHONE], ["laptop", DESK]]) {
    const { context, page } = await open(viewport);
    await go(page, "/calendar");
    const upcoming = page.getByTestId("calendar-upcoming");
    check(await upcoming.isVisible(), `${label}: the upcoming list is there`);
    check(await page.locator("[data-testid=calendar-week]").count() === 0, `${label}: the week grid doesn't hide it`);
    const [top, below] = await Promise.all([upcoming.boundingBox(), page.getByTestId("calendar-happened").boundingBox()]);
    check(top && below && top.y < below.y, `${label}: upcoming comes before the festival`);
    check((await upcoming.locator(".ev__title a").allTextContents()).join() === "Seed Gathering", `${label}: only upcoming events sit in it`);
    check(await upcoming.locator("[data-testid=card-rsvp]").count() === 1, `${label}: an upcoming event keeps its RSVP`);
    check(await page.locator("[data-testid=card-rsvp]").count() === 1, `${label}: the festival's rows have none`);
    const all = await titles(page);
    check(all[0] === "Seed Gathering" && REAL.every((n) => all.includes(n)), `${label}: the festival stays below (${all.length})`);
    check(await noOverflow(page), `${label}: no sideways scroll`);
    await shot(page, `09-upcoming-${label}`);
    await page.getByRole("option", { name: /Oct 17/ }).click();
    await page.waitForFunction(() => document.querySelectorAll(".flow2__b [data-testid=event-card]").length === 4);
    check(await upcoming.isVisible(), `${label}: picking a festival day keeps upcoming on top`);
    await context.close();
  }
  const { context, page } = await open(PHONE);
  await go(page, "/");
  check(await page.getByTestId("home-events").isVisible(), "home: what's coming up is shown");
  check(await page.getByTestId("home-happened").count() === 0, "home: no look back while something is upcoming");
  check((await page.getByTestId("home-events").locator(".ev__title").allTextContents()).join() === "Seed Gathering", "home: only the upcoming event");
  await context.close();
}

await browser.close();
if (fails.length) { console.error(`\n${fails.length} failed`); process.exit(1); }
console.log(`\nAll passed (${mode}).`);
