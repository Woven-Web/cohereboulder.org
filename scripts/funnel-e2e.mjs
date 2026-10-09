// End-to-end proof of the registration funnel counts, in a real browser
// against a local wrangler dev. Never touches scenius.social, sends no mail,
// and every person here is invented.
//
//   0. the public beacon route refuses a foreign Origin, an unknown event,
//      a field the form does not have, and a client-claimed "submitted"
//   1. a visitor opens /register: `view` moves, and so do the questions that
//      scrolled into view — but a question far below the fold does not
//   2. the visitor focuses a later question: its `reached:` count moves, once
//      even when focused again
//   3. clicking Submit with required fields empty (validation blocks the
//      form) still counts a `submit_attempt`; `submitted` does not move
//   4. a full submission moves `submitted`
//   5. nothing identifying was sent: the beacons carry only {event}, and the
//      table holds only counters
//   6. /admin's Funnel tab shows the questions in form order with counts
//
// Usage:
//   npx wrangler dev --port 8795 --persist-to <dir>
//   E2E_PERSIST_DIR=<dir> node scripts/funnel-e2e.mjs http://127.0.0.1:8795 <admin-session-token>
//
// The session token is a COHERE_AUTH KV row plus an `admins` row (see
// scripts/ci-e2e.sh seed_d1_and_kv).

import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const target = process.argv[2];
const sessionToken = process.argv[3];
const persist = process.env.E2E_PERSIST_DIR;
if (!target || !sessionToken || !persist) {
  console.error("usage: E2E_PERSIST_DIR=<dir> node scripts/funnel-e2e.mjs <wrangler-dev-url> <admin-session-token>");
  process.exit(2);
}

const SLUG = "register-2026";
const stamp = Date.now().toString(36);
let step = "start";
const ok = (m) => console.log(`  ok  ${m}`);
function fail(m) {
  throw new Error(m);
}
function expect(cond, m) {
  if (!cond) fail(m);
}

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "cohere", "--local", "--persist-to", persist, "--json", "--command", sql],
    { encoding: "utf8" },
  );
  return JSON.parse(out)[0].results;
}

// Long enough that the last question sits well below the first screen at the
// small viewport used here, so "reached by scrolling" is distinguishable from
// "reached because it was on screen from the start".
const fields = [
  { key: "full_name", label: "Full Name", type: "text", required: true },
  { key: "email", label: "Email Address", type: "email", required: true },
  { key: "phone", label: "Phone Number", type: "tel" },
  { key: "how_did_you_hear", label: "How did you hear about COhere?", type: "textarea" },
  { key: "resilience_nomination", label: "Who would you nominate?", type: "textarea" },
  { key: "contribution", label: "What will you contribute?", type: "textarea" },
  { key: "volunteer_interest", label: "Volunteering?", type: "radio", options: ["Yes", "No"] },
  { key: "additional_notes", label: "Additional notes", type: "textarea" },
];
const FIELD_SQL = JSON.stringify(fields).replace(/'/g, "''");

const counts = () => {
  const out = {};
  for (const r of d1(`SELECT event, SUM(count) AS n FROM form_funnel WHERE form_slug = '${SLUG}' GROUP BY event`)) out[r.event] = r.n;
  return out;
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL: target, viewport: { width: 390, height: 700 } });
  const page = await context.newPage();
  const beacons = [];
  await page.route("**/api/funnel/**", async (route) => {
    const req = route.request();
    beacons.push({ url: req.url(), body: req.postData() ?? req.postDataBuffer()?.toString() ?? "", headers: await req.allHeaders() });
    await route.continue();
  });

  // ── 0. the public door ───────────────────────────────────────────────────
  step = "rejects";
  d1(`DELETE FROM form_funnel`);
  d1(
    `INSERT INTO forms (slug, title, event, fields, active, created_at, updated_at)
     VALUES ('${SLUG}', 'Register ${stamp}', 'october2026', '${FIELD_SQL}', 1, datetime('now'), datetime('now'))
     ON CONFLICT(slug) DO UPDATE SET fields = excluded.fields, active = 1`,
  );
  const send = (body, headers = {}) =>
    context.request.post(`/api/funnel/${SLUG}`, { data: JSON.stringify(body), headers: { "Content-Type": "text/plain", ...headers } });
  expect((await send({ event: "view" }, { Origin: "https://evil.example" })).status() === 403, "a foreign Origin is refused");
  expect((await send({ event: "nope" })).status() === 400, "an unknown event is refused");
  expect((await send({ event: "reached:passport" })).status() === 400, "an unknown field is refused");
  expect((await send({ event: "submitted" })).status() === 400, "the client cannot claim a submission");
  expect((await context.request.post(`/api/funnel/no-such-form`, { data: JSON.stringify({ event: "view" }) })).status() === 404, "unknown form is a 404");
  expect(Object.keys(counts()).length === 0, "refused beacons stored nothing");
  ok("foreign origin, unknown event, unknown field, client-side `submitted` and unknown form are all refused");

  // ── 1. view + what scrolled into view ───────────────────────────────────
  step = "view";
  await page.goto("/register", { waitUntil: "networkidle" });
  await page.locator("#field-full_name").waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  let c = counts();
  expect(c.view === 1, `view should be 1, got ${JSON.stringify(c)}`);
  expect(!c["reached:additional_notes"], "a question far below the fold has not been reached yet");
  ok("view counted once; the last question is not reached before the visitor gets there");

  // ── 2. focusing a later question ────────────────────────────────────────
  step = "focus";
  await page.locator("#field-contribution").focus();
  await page.waitForTimeout(500);
  await page.locator("#field-full_name").focus();
  await page.locator("#field-contribution").focus();
  await page.waitForTimeout(500);
  c = counts();
  expect(c["reached:contribution"] === 1, `contribution reached exactly once, got ${JSON.stringify(c)}`);
  expect(c["reached:full_name"] === 1, `full_name reached exactly once, got ${JSON.stringify(c)}`);
  ok("each question is counted the first time only, however often it is focused");

  // ── 3. a failed attempt still counts ────────────────────────────────────
  step = "attempt";
  await page.getByRole("button", { name: "Submit Registration" }).click();
  await page.waitForTimeout(500);
  c = counts();
  expect(c.submit_attempt === 1, `submit_attempt counted although validation blocked it: ${JSON.stringify(c)}`);
  expect(!c.submitted, "nothing was submitted");
  ok("a click on Submit counts even when validation stops the form");

  // ── 4. a real submission ────────────────────────────────────────────────
  step = "submit";
  await page.locator("#field-full_name").fill(`Fiona Funnel ${stamp}`);
  await page.locator("#field-email").fill(`fiona-${stamp}@funnel.test`);
  await page.getByRole("button", { name: "Submit Registration" }).click();
  await page.getByText(/woven in|You're in/i).waitFor({ timeout: 15_000 });
  c = counts();
  expect(c.submitted === 1, `submitted should be 1, got ${JSON.stringify(c)}`);
  expect(c.submit_attempt === 1, "a second click in the same page load is not counted again");
  expect(c.view === 1, "still one view for one page load");
  ok("a successful registration moves `submitted`; the repeat click did not double-count");

  // ── 5. nothing identifying left the browser ─────────────────────────────
  step = "privacy";
  expect(beacons.length >= 4, `expected several beacons, saw ${beacons.length}`);
  for (const b of beacons) {
    const body = JSON.parse(b.body);
    expect(Object.keys(body).length === 1 && typeof body.event === "string", `beacon carried more than {event}: ${b.body}`);
    expect(!b.body.includes(stamp) && !b.body.includes("@"), "no answer or email in a beacon");
    expect(!b.headers.cookie, "no cookie on a beacon");
  }
  const columns = d1(`PRAGMA table_info(form_funnel)`).map((r) => r.name).join(",");
  expect(columns === "form_slug,day,event,count", `table holds only counters, has ${columns}`);
  ok("beacons carry only {event}, no cookie; the table has no identifying column");

  // ── 6. the admin view ───────────────────────────────────────────────────
  step = "admin";
  const anon = await browser.newContext({ baseURL: target });
  expect((await anon.request.get(`/api/admin/funnel/${SLUG}`)).status() === 401, "funnel report needs a session");
  await anon.close();
  await context.addCookies([{ name: "cohere_session", value: sessionToken, url: target, httpOnly: true, sameSite: "Lax" }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.locator('[data-tab="funnel"]').click();
  await page.locator("#funnel-form").selectOption(SLUG);
  await page.locator("#funnel-rows tr").first().waitFor({ timeout: 10_000 });
  const rows = await page.locator("#funnel-rows tr").allTextContents();
  const flat = rows.map((r) => r.replace(/\s+/g, " ").trim());
  const order = ["Form views", "Full Name", "Email Address", "Phone Number", "How did you hear", "Who would you nominate", "What will you contribute", "Volunteering", "Additional notes", "Submit clicked", "Registered"];
  let at = -1;
  for (const label of order) {
    const i = flat.findIndex((r, idx) => idx > at && r.includes(label));
    expect(i > at, `"${label}" missing or out of form order in ${JSON.stringify(flat)}`);
    at = i;
  }
  expect(flat[0].includes("1"), `views row shows the count: ${flat[0]}`);
  expect(flat.find((r) => r.includes("Registered")).includes("1"), "registered row shows 1");
  ok("the Funnel tab lists views, each question in form order, attempts and registrations");

  console.log("Registration funnel e2e passed.");
} catch (error) {
  console.error(`FAILED at "${step}": ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
