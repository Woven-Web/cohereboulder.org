// End-to-end proof of "My events" in a real browser against a local wrangler
// dev + the mock AppView. Never touches scenius.social; send_email locally
// only writes .eml files.
//
//   1. before any RSVP: no My events toggle on /calendar, no "Your next" on /today
//   2. RSVP by email on an event page → /calendar defaults to "My events"
//      showing it, with the source note; "All" shows the full list
//   3. /today shows "Your next" linking to the event
//   4. a reload keeps it (localStorage); removing it locally empties the list
//      and does NOT cancel the RSVP server-side
//   5. Add to calendar offers a Google link and a valid .ics download
//
// Usage:
//   node scripts/regenos-mock.mjs &     # :9944
//   npx wrangler dev --port 8790 \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9944 \
//     --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
//   node scripts/myevents-e2e.mjs http://127.0.0.1:8790

import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/myevents-e2e.mjs <wrangler-dev-url>");
  process.exit(2);
}

const failures = [];
let step = "";
const ok = (m) => console.log(`ok  ${m}`);
const fail = (m) => {
  failures.push(`${step}: ${m}`);
  console.error(`FAIL  ${step}: ${m}`);
};
const email = `myevents-${Date.now().toString(36)}@example.org`;

const browser = await chromium.launch();
// Frozen before the gathering: Oct 15–25 the Calendar opens on today, but the mock seeds events
// relative to the wall clock. Pinned, the default view is every upcoming date on any day.
const context = await browser.newContext({ baseURL: target, acceptDownloads: true, serviceWorkers: "block" });
await context.clock.setFixedTime(new Date("2026-10-01T18:00:00Z"));
const page = await context.newPage();
page.on("pageerror", (error) => fail(`uncaught page error — ${error}`));

try {
  step = "empty state";
  await page.goto("/calendar", { waitUntil: "networkidle" });
  await page.getByTestId("event-card").first().waitFor({ timeout: 15_000 });
  if (await page.getByTestId("my-events-toggle").count()) fail("My events toggle shown before any RSVP");
  await page.goto("/today", { waitUntil: "networkidle" });
  if (await page.getByTestId("your-next").count()) fail("Your next shown before any RSVP");
  ok("no toggle and no Your next before an RSVP");

  step = "rsvp";
  await page.goto("/calendar", { waitUntil: "networkidle" });
  // During the festival the picker opens on today; count every upcoming date.
  const everyDate = page.getByRole("button", { name: "Show every date" });
  if (await everyDate.count()) await everyDate.click();
  const cards = await page.getByTestId("event-card").count();
  await page.getByRole("button", { name: "RSVP", exact: true }).first().click();
  await page.waitForURL(/\/events\/.+#rsvp$/, { timeout: 10_000 });
  const eventName = (await page.locator("h1").first().innerText()).trim();
  await page.getByTestId("rsvp-form").waitFor({ timeout: 10_000 });
  await page.locator("#rsvp-name").fill("Ana Mock");
  await page.locator("#rsvp-email").fill(email);
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await page.getByTestId("rsvp-done").waitFor({ timeout: 10_000 });
  const stored = await page.evaluate(() => localStorage.getItem("cohere.myEvents.v1"));
  if (!stored || JSON.parse(stored).items?.[0]?.source !== "email") fail(`nothing recorded locally: ${stored}`);
  if (stored?.includes(email)) fail("the email address was written to localStorage");
  ok(`RSVP'd by email to "${eventName}" and it was recorded on this device`);

  step = "add to calendar";
  await page.getByTestId("add-to-calendar").click();
  const href = await page.getByRole("menuitem", { name: "Google Calendar" }).getAttribute("href");
  if (!href?.startsWith("https://calendar.google.com/calendar/r/eventedit?") || !href.includes("details=")) fail(`Google link: ${href}`);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 10_000 }),
    page.getByRole("menuitem", { name: "Apple / other calendars (.ics)" }).click(),
  ]);
  const ics = readFileSync(await download.path(), "utf8");
  if (!ics.startsWith("BEGIN:VCALENDAR\r\n") || !ics.endsWith("END:VCALENDAR\r\n") || !/\r\nURL:.*\/events\//.test(ics) || !/\r\nUID:.+@cohereboulder\.org\r\n/.test(ics)) fail(`bad .ics:\n${ics}`);
  ok("Add to calendar: Google link and a well-formed .ics");

  step = "my events";
  await page.goto("/calendar", { waitUntil: "networkidle" });
  await page.getByTestId("my-events-toggle").waitFor({ timeout: 10_000 });
  if ((await page.getByRole("button", { name: /^All events/ }).getAttribute("aria-pressed")) !== "true") fail("All events should be the default");
  await page.getByRole("button", { name: /^My events/ }).click();
  if ((await page.getByTestId("event-card").count()) !== 1) fail("My events should list just the RSVP'd event");
  if (!(await page.getByText("Events you RSVP'd to on this device").count())) fail("source note missing");
  await page.getByRole("button", { name: /^All events/ }).click();
  if (await everyDate.count()) await everyDate.click();
  if ((await page.getByTestId("event-card").count()) !== cards) fail("All did not restore the full list");
  await page.getByRole("button", { name: /^My events/ }).click();
  ok("/calendar defaults to All events; My events narrows to the RSVP with the source note; All restores the list");

  step = "your next";
  await page.goto("/today", { waitUntil: "networkidle" });
  const next = page.getByTestId("your-next");
  await next.waitFor({ timeout: 10_000 });
  await next.getByRole("link", { name: eventName }).click();
  await page.waitForURL(/\/events\//, { timeout: 10_000 });
  ok("/today shows Your next, linking to the event");

  step = "remove";
  await page.goto("/calendar", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^My events/ }).click();
  await page.getByTestId("my-events-remove").click();
  await page.getByTestId("my-events-toggle").waitFor({ state: "detached", timeout: 10_000 });
  const again = await context.request.post("/api/rsvp", { data: { did: "did:plc:mockscene", rkey: "ev-seed1", email } });
  if ((await again.json()).already !== true) fail("local removal cancelled the server-side RSVP");
  ok("removing is local only; the RSVP still stands server-side");
} catch (error) {
  fail(`unexpected: ${error}`);
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nmyevents-e2e passed");
