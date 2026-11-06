// Read-only check of the calendar after the festival against a deployed site, on the real events:
// the API, every event's page, and a browser on a phone and a laptop. Writes nothing anywhere.
//
//   node scripts/past-calendar-live-check.mjs https://cohere-signup-staging.unforced.workers.dev [shots-dir]
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [base, shots] = process.argv.slice(2);
if (!base) { console.error("usage: node scripts/past-calendar-live-check.mjs <site-url> [shots-dir]"); process.exit(2); }
if (shots) await mkdir(shots, { recursive: true });
const fails = [];
const check = (cond, m) => { if (!cond) { fails.push(m); console.error(`FAIL ${m}`); } else console.log(`PASS ${m}`); };
const TITLE = "COhere 2026 happened Oct 15–25";

const listing = await (await fetch(`${base}/api/events?past=true`)).json();
const events = listing.events ?? [];
const day = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date(iso));
const perDay = {};
for (const e of events) perDay[day(e.startsAt)] = (perDay[day(e.startsAt)] ?? 0) + 1;
console.log(`/api/events?past=true: ${events.length} events`, JSON.stringify(perDay));
check(events.length >= 45, `the API shows the festival (${events.length} events)`);
check(!events.some((e) => e.name.trim().toUpperCase() === "TEST"), "no TEST record");
check(!events.some((e) => e.status === "cancelled"), "no cancelled event");

let opened = 0;
for (const e of events) {
  const res = await fetch(`${base}/api/events/${encodeURIComponent(e.did)}/${encodeURIComponent(e.rkey)}`);
  const body = res.ok ? await res.json() : null;
  if (res.ok && body?.event?.name === e.name) opened += 1;
  else console.error(`  ${res.status} ${e.rkey} ${e.name}`);
}
check(opened === events.length, `every event's page answers: ${opened}/${events.length}`);

const browser = await chromium.launch();
const open = async (width, height) => {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
};
const shot = async (page, name, fullPage = false) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage }); };

{
  const { context, page, errors } = await open(390, 844);
  await page.goto(`${base}/calendar`);
  await page.getByRole("heading", { name: TITLE }).waitFor({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  const rows = await page.locator("[data-testid=event-card]").count();
  check(rows === events.length, `phone: every event is on the page (${rows})`);
  check(await page.locator("[data-testid=card-rsvp]").count() === 0, "phone: no RSVP buttons");
  check(await page.locator("iframe").count() === 0, "phone: no Luma embed");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "phone: no sideways scroll");
  await shot(page, "01-calendar-phone");
  await page.getByRole("option", { name: /Oct 17/ }).click();
  await page.locator(".agenda-head").waitFor();
  const onDay = await page.locator("[data-testid=event-card]").count();
  check(onDay === perDay["2026-10-17"], `phone: Oct 17 shows its ${perDay["2026-10-17"]} events (${onDay})`);
  await shot(page, "02-calendar-phone-oct17");
  const link = page.locator("[data-testid=event-card] .ev__title a").first();
  const name = await link.textContent();
  await link.click();
  await page.getByRole("heading", { level: 1, name }).waitFor({ timeout: 15000 });
  await page.waitForLoadState("networkidle");
  check(new URL(page.url()).pathname.startsWith("/events/"), `phone: opened "${name}"`);
  check(await page.locator(".lede").first().isVisible(), "phone: its description reads");
  check(await page.locator("[data-testid=event-rsvp]").count() === 0, "phone: no RSVP form");
  await shot(page, "03-event-phone");
  check(errors.length === 0, `phone: no page errors ${errors.join("; ")}`);
  await context.close();
}
{
  const { context, page, errors } = await open(1280, 800);
  await page.goto(`${base}/calendar`);
  await page.getByTestId("calendar-week").waitFor({ timeout: 20000 });
  await page.waitForLoadState("networkidle");
  check((await page.locator(".week__bar .mono").textContent()).includes("Oct 15"), "laptop: the grid lands on the festival's first week");
  const chips = await page.locator("a.week__ev").count();
  check(chips > 20, `laptop: the grid is full of events (${chips})`);
  await shot(page, "04-calendar-desktop");
  await page.getByTestId("calendar-week").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo({ top: document.querySelector("[data-testid=calendar-week]").getBoundingClientRect().top + window.scrollY - 90 }));
  await shot(page, "05-calendar-desktop-grid");
  await page.locator("a.week__ev").first().click();
  await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 15000 });
  await page.waitForLoadState("networkidle");
  check(new URL(page.url()).pathname.startsWith("/events/"), "laptop: a chip opens its event");
  await shot(page, "06-event-desktop");
  check(errors.length === 0, `laptop: no page errors ${errors.join("; ")}`);
  await context.close();
}
{
  const { context, page } = await open(390, 844);
  await page.goto(`${base}/`);
  const band = page.getByTestId("home-happened");
  await band.waitFor({ timeout: 20000 });
  await band.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  const links = await band.locator('a[href^="/events/"]').allTextContents();
  check(links.length === 4, `home: four events, from the opening to the close: ${links.join(" | ")}`);
  await shot(page, "07-home-phone");
  await context.close();
}
await browser.close();
if (fails.length) { console.error(`\n${fails.length} failed`); process.exit(1); }
console.log("\nAll passed.");
