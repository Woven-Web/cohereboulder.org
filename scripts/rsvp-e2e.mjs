// End-to-end proof of "RSVP" without an account, in a real
// browser against a local wrangler dev + the mock AppView. Never touches
// scenius.social, and never sends real mail: local wrangler's send_email
// binding only writes .eml files and logs them.
//
//   1. the event page's form stores an RSVP (and a repeat is deduped)
//   2. the admin portal shows it on the event (portal session cookie)
//   3. the scheduled handler, fired as if it were 9am the day before, claims
//      it (reminder_sent_at) — and a second run sends nothing more
//   4. the cancel link: browser auto-POSTs; plain GET never mutates
//
// Usage:
//   node scripts/regenos-mock.mjs &     # :9944
//   npx wrangler dev --port 8790 --test-scheduled \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9944 \
//     --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
//   node scripts/rsvp-e2e.mjs http://127.0.0.1:8790 <admin-session-token> http://127.0.0.1:9944

import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const target = process.argv[2];
const sessionToken = process.argv[3];
const mockUrl = process.argv[4] ?? "http://127.0.0.1:9944";
if (!target || !sessionToken) {
  console.error("usage: node scripts/rsvp-e2e.mjs <wrangler-dev-url> <admin-session-token> [mock-url]");
  process.exit(2);
}

const SCENE = "did:plc:mockscene";
const RKEY = "ev-seed1";
const failures = [];
let step = "";
function ok(message) {
  console.log(`ok  ${message}`);
}
function fail(message) {
  failures.push(`${step}: ${message}`);
  console.error(`FAIL  ${step}: ${message}`);
}

const email = `rsvp-${Date.now().toString(36)}@example.org`;
const adminCookie = `cohere_session=${sessionToken}`;

async function adminRsvps(request) {
  const res = await request.get(`/api/admin/rsvps/${encodeURIComponent(SCENE)}/${RKEY}`, {
    headers: { Cookie: adminCookie },
  });
  if (!res.ok()) throw new Error(`admin rsvps answered ${res.status()}`);
  return (await res.json()).rsvps;
}

/** Fire the Worker's scheduled() as if the clock read `time`. */
async function runCron(request, time) {
  const res = await request.get(`/cdn-cgi/local/scheduled?cron=${encodeURIComponent("0 15 * * *")}&time=${time}`);
  if (!res.ok()) throw new Error(`scheduled trigger answered ${res.status()}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: target });
const page = await context.newPage();
page.on("pageerror", (error) => fail(`uncaught page error — ${error}`));

try {
  // ── 0. The event we RSVP to: the mock's seeded one, a week out ──────────
  const detail = await (await context.request.get(`${mockUrl}/xrpc/social.scenius.getEvent?uri=${encodeURIComponent(`at://${SCENE}/community.lexicon.calendar.event/${RKEY}`)}`)).json();
  const startsAt = Date.parse(detail.value.startsAt);

  // ── 1. The form, from an event card's RSVP button ────────────────────────
  step = "email rsvp";
  await page.goto("/calendar", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "RSVP", exact: true }).first().click();
  await page.waitForURL(/\/events\/.+#rsvp$/, { timeout: 10_000 });
  await page.getByTestId("rsvp-form").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Add to calendar" }).click();
  const google = page.getByRole("menuitem", { name: "Google Calendar" });
  const href = await google.getAttribute("href");
  if (!href?.startsWith("https://calendar.google.com/calendar/r/eventedit?")) fail(`Google Calendar link missing: ${href}`);
  await page.getByRole("menuitem", { name: "Apple / other calendars (.ics)" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Subscribe to calendar", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Apple Calendar" }).waitFor();
  await page.getByRole("dialog").getByRole("link", { name: "Google Calendar" }).waitFor();
  const feedUrl = await page.getByRole("textbox", { name: "Calendar feed URL" }).inputValue();
  if (!feedUrl.endsWith("/calendar.ics")) fail(`subscription feed missing: ${feedUrl}`);
  await page.keyboard.press("Escape");
  ok("calendar subscription explains Apple and Google feed setup");
  // This lane explicitly switches sign-in off; the anonymous email form
  // remains available and offers no dead sign-in control.
  if (await page.getByText("or sign in to RSVP with your COhere account").count()) {
    fail("sign-in link shown with the lane off");
  }
  await page.locator("#rsvp-name").fill("Ana Mock");
  await page.locator("#rsvp-email").fill(email);
  await page.getByRole("button", { name: "RSVP", exact: true }).click();
  await page.getByTestId("rsvp-done").getByText("You're on the list!").waitFor({ timeout: 10_000 });
  ok("card → event page #rsvp → form stored the RSVP");

  const again = await context.request.post("/api/rsvp", {
    data: { did: SCENE, rkey: RKEY, email: email.toUpperCase() },
  });
  if ((await again.json()).already !== true) fail("a repeat RSVP was not deduped");
  const bad = await context.request.post("/api/rsvp", { data: { did: SCENE, rkey: RKEY, email: "nope" } });
  if (bad.status() !== 400) fail(`a bad address answered ${bad.status()}, not 400`);
  const unknown = await context.request.post("/api/rsvp", { data: { did: SCENE, rkey: "ev-missing", email } });
  if (unknown.status() !== 404) fail(`an unknown event answered ${unknown.status()}, not 404`);
  ok("dedupe, validation, and unknown-event refusals hold");

  // ── 2. Admin: the portal lists it; anonymous callers can't ──────────────
  step = "admin";
  const anon = await context.request.get(`/api/admin/rsvps/${encodeURIComponent(SCENE)}/${RKEY}`);
  if (anon.status() !== 401) fail(`anonymous admin read answered ${anon.status()}`);
  let rows = await adminRsvps(context.request);
  const mine = rows.filter((r) => r.email === email);
  if (mine.length !== 1 || mine[0].name !== "Ana Mock") fail(`admin list: ${JSON.stringify(rows)}`);
  await context.addCookies([{ name: "cohere_session", value: sessionToken, url: target, httpOnly: true, sameSite: "Lax" }]);
  const admin = await context.newPage();
  await admin.goto("/admin", { waitUntil: "networkidle" });
  await admin.getByRole("tab", { name: "Events", exact: true }).click();
  const row = admin.locator("#eventrows tr", { hasText: "Seed Gathering" });
  await row.getByText("by email").waitFor({ timeout: 15_000 });
  await row.click();
  await admin.locator("#emailrsvpbody").getByText(email).waitFor({ timeout: 10_000 });
  await admin.close();
  await context.clearCookies({ name: "cohere_session" });
  ok("admin events table counts it and the drawer lists it; anonymous gets 401");

  // ── 3. The cron: a day early sends nothing, the morning before claims it ─
  step = "cron";
  // The mock starts at the current wall-clock time, not necessarily in the
  // afternoon. Subtracting 20h can still be the event's Boulder calendar day.
  // Exercise the actual 15:00 UTC cron on the preceding Boulder date instead.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver", year: "numeric", month: "numeric", day: "numeric",
  }).formatToParts(new Date(startsAt));
  const part = (type) => Number(parts.find((p) => p.type === type).value);
  const morningBefore = Date.UTC(part("year"), part("month") - 1, part("day") - 1, 15);
  await runCron(context.request, morningBefore - 2 * 24 * 3600 * 1000);
  rows = await adminRsvps(context.request);
  if (rows.find((r) => r.email === email)?.reminder_sent_at) fail("reminded three days early");
  await runCron(context.request, morningBefore);
  rows = await adminRsvps(context.request);
  const sentAt = rows.find((r) => r.email === email)?.reminder_sent_at;
  if (!sentAt) fail("the morning-before run did not claim the RSVP");
  await runCron(context.request, morningBefore + 3600 * 1000);
  rows = await adminRsvps(context.request);
  if (rows.find((r) => r.email === email)?.reminder_sent_at !== sentAt) fail("a second run touched it again");
  ok("scheduled() reminds only on the day before, once");

  // ── 4. The cancel link ───────────────────────────────────────────────────
  // The token only travels by email, so read it straight from the local D1
  // the Worker is using (ci-e2e.sh passes the same --persist-to dir).
  step = "cancel";
  const persist = process.env.E2E_PERSIST_DIR;
  if (!persist) throw new Error("E2E_PERSIST_DIR is required to read the cancel token");
  const out = execFileSync("npx", [
    "wrangler", "d1", "execute", "cohere", "--local", "--persist-to", persist, "--json",
    "--command", `SELECT cancel_token FROM event_rsvps WHERE email = '${email}'`,
  ], { encoding: "utf8" });
  const token = JSON.parse(out)[0].results[0]?.cancel_token;
  if (!token) throw new Error("no cancel token stored");
  const preview = await context.request.get(`/rsvp/cancel?token=${token}`);
  if (preview.status() !== 200) fail(`the preview answered ${preview.status()}`);
  if (!(await adminRsvps(context.request)).some((r) => r.email === email)) fail("a plain GET cancelled the RSVP");
  await page.goto(`/rsvp/cancel?token=${token}`);
  await page.getByText("RSVP cancelled").waitFor({ timeout: 10_000 });
  if ((await adminRsvps(context.request)).some((r) => r.email === email)) fail("the browser did not submit the cancellation");
  const oneClick = await context.request.post(`/rsvp/cancel?token=${token}`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: "List-Unsubscribe=One-Click",
  });
  if (oneClick.status() !== 200) fail(`a repeat one-click POST answered ${oneClick.status()}`);
  const probe = await context.request.get("/rsvp/cancel?token=0000000000000000");
  if (probe.status() !== 404) fail(`an unknown token answered ${probe.status()}`);
  ok("cancel link: plain GET is harmless; browser auto-POSTs; repeats and unknown tokens are harmless");
} catch (error) {
  fail(error.message.split("\n")[0]);
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
console.log("RSVP e2e passed.");
