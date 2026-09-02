// End-to-end proof of the organizers' calendar lane, in a real browser against
// the mock AppView (scripts/regenos-mock.mjs) — the Events tab's create /
// RSVP / edit / delete round trip, the Access tab's invite / role / revoke,
// and the two things that must NOT happen:
//
//   * the raw invite token from proposeInvite must never reach the browser —
//     whoever holds it becomes a builder of the collective;
//   * a Worker deployed with a wrong or missing service token must fail
//     honestly (a sentence an organizer can read), never with a stack trace,
//     and the events LIST must keep working because that read is anonymous.
//
// The admin session is a KV row rather than a real sign-in: this exercises the
// calendar, not the magic-link flow that worker/src/auth.ts already owns.
//
// Usage (three terminals, or backgrounded):
//   PORT=9945 node scripts/regenos-mock.mjs
//   npx wrangler dev --port 8795 \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9945 \
//     --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
//     --var REGENOS_SERVICE_TOKEN:mock-token
//   node scripts/admin-events-e2e.mjs http://127.0.0.1:8795 <session-token> \
//     [http://127.0.0.1:9945]
//
// The session token is whatever you wrote into local KV, e.g.
//   node -e 'console.log(require("crypto").createHash("sha256").update("TOK").digest("hex"))'
//   npx wrangler kv key put --binding COHERE_AUTH --local "session:<hash>" \
//     '{"email":"e2e@cohere.test","name":"E2E Organizer","createdAt":"2026-09-01T00:00:00Z"}'
// ...with an `admins` row for that address in the local D1.
//
// Start the mock FRESH: its roster and calendar are in-memory, so a previous
// run's revoke leaves it without the builder this script expects.

import { chromium } from "playwright";

const target = process.argv[2];
const sessionToken = process.argv[3];
const mockUrl = process.argv[4] ?? "http://127.0.0.1:9945";
if (!target || !sessionToken) {
  console.error("usage: node scripts/admin-events-e2e.mjs <wrangler-dev-url> <session-token> [mock-url]");
  process.exit(2);
}

const failures = [];
let step = "";
function ok(message) {
  console.log(`ok    ${message}`);
}
function fail(message) {
  failures.push(`${step}: ${message}`);
  console.error(`FAIL  ${step}: ${message}`);
}
function expect(condition, message) {
  if (condition) ok(message);
  else fail(message);
}

const stamp = Date.now().toString(36);
const eventName = `E2E Ecology Walk ${stamp}`;
const renamedName = `E2E Ecology Walk at Dawn ${stamp}`;

/** A datetime-local value in the browser's own zone, N days out at 18:30. */
function localDatetime(daysOut, hour) {
  const d = new Date(Date.now() + daysOut * 24 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:30`;
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: target });
await context.addCookies([
  { name: "cohere_session", value: sessionToken, url: target, httpOnly: true, sameSite: "Lax" },
]);
const page = await context.newPage();

// A leaked invite token would most likely leak through a response body the
// page read, so watch every response the browser sees.
let tokenLeak = null;
page.on("response", async (response) => {
  if (!response.url().includes("/api/admin/")) return;
  try {
    const body = await response.text();
    if (body.includes("mock-invite-token")) tokenLeak = response.url();
  } catch {
    /* body already consumed or a redirect — nothing to inspect */
  }
});
page.on("pageerror", (error) => fail(`uncaught page error — ${error}`));

async function openTab(name) {
  await page.getByRole("tab", { name, exact: true }).click();
}

try {
  // ── 1. The portal opens straight into the app, session cookie and all ─────
  step = "sign in";
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.locator("#app").waitFor({ state: "visible", timeout: 15_000 });
  ok("the KV session opened the portal without a magic link");

  // ── 2. The Events tab lists the whole calendar, past included ─────────────
  step = "events tab";
  await openTab("Events");
  await page.locator("#eventrows tr", { hasText: "Seed Gathering" }).waitFor({ timeout: 15_000 });
  ok("upcoming list shows the seeded event");

  await page.locator('#tab-events .chip[data-when="past"]').click();
  await page.locator("#eventrows tr", { hasText: "Last Month's Potluck" }).waitFor({ timeout: 10_000 });
  ok("the Past toggle shows an event /api/events drops");
  await page.locator('#tab-events .chip[data-when="upcoming"]').click();

  // ── 3. Create ─────────────────────────────────────────────────────────────
  step = "create";
  await page.locator("#newevent").click();
  await page.locator("#evname").waitFor({ state: "visible" });
  await page.locator("#evname").fill(eventName);
  await page.locator("#evdesc").fill("A slow walk along the creek, then tea.");
  await page.locator("#evstart").fill(localDatetime(10, 18));
  await page.locator("#evend").fill(localDatetime(10, 20));
  await page.locator("#evplace").fill("Chautauqua Ranger Cottage");
  await page.locator("#evstreet").fill("900 Baseline Rd");
  expect(
    (await page.locator("#evcity").inputValue()) === "Boulder" &&
      (await page.locator("#evregion").inputValue()) === "CO",
    "a new event prefills Boulder, CO",
  );
  await page.locator("#evpostal").fill("80302");
  await page.locator("#evrsvp").selectOption("approval");
  await page.locator("#evcap").fill("25");
  await page.locator("#evsave").click();
  await page.locator("#eventrows tr", { hasText: eventName }).waitFor({ timeout: 15_000 });
  ok(`created "${eventName}" and it is on the admin list`);

  // ── 4. …and it is on the PUBLIC calendar feed ─────────────────────────────
  step = "public calendar";
  const publicFeed = await (await fetch(new URL("/api/events", target))).json();
  expect(
    (publicFeed.events ?? []).some((e) => e.name === eventName),
    "the new event is on the public /api/events feed",
  );

  // ── 5. The RSVP panel ─────────────────────────────────────────────────────
  step = "rsvp panel";
  await page.locator("#eventrows tr", { hasText: "Seed Gathering" }).click();
  await page.locator("#rsvpbody").waitFor({ state: "visible" });
  await page.locator("#rsvpbody", { hasText: "confirmed" }).waitFor({ timeout: 10_000 });
  const rsvpText = await page.locator("#rsvppanel").innerText();
  expect(rsvpText.includes("2 confirmed"), "the panel shows the mock's confirmed count");
  expect(rsvpText.includes("1 requested"), "the panel shows the requested count");
  expect(rsvpText.includes("ana.mock.test"), "the panel lists the confirmed guest's handle");
  expect(
    rsvpText.includes("aren't visible here yet"),
    "the panel says out loud that requests and the waitlist are not shown",
  );
  await page.locator("#closedrawer").click();

  // ── 6. Edit ───────────────────────────────────────────────────────────────
  step = "edit";
  await page.locator("#eventrows tr", { hasText: eventName }).click();
  await page.locator("#evname").waitFor({ state: "visible" });
  expect(
    (await page.locator("#evplace").inputValue()) === "Chautauqua Ranger Cottage",
    "the edit form prefills from the stored event (an omitted field would be a deleted one)",
  );
  await page.locator("#evrsvp").waitFor();
  await page.waitForFunction(() => !document.getElementById("evcap").disabled, null, {
    timeout: 10_000,
  });
  expect(
    (await page.locator("#evcap").inputValue()) === "25" &&
      (await page.locator("#evrsvp").inputValue()) === "approval",
    "the seat policy is read back from getEventAttendance, not guessed",
  );
  await page.locator("#evname").fill(renamedName);
  await page.locator("#evsave").click();
  await page.locator("#eventrows tr", { hasText: renamedName }).waitFor({ timeout: 15_000 });
  ok("the rename landed on the admin list");

  const renamedFeed = await (await fetch(new URL("/api/events", target))).json();
  expect(
    (renamedFeed.events ?? []).some((e) => e.name === renamedName),
    "the rename shows on the public feed too",
  );

  // ── 7. Access: the roster, an invite, a role change, a revoke ─────────────
  step = "access tab";
  await openTab("Access");
  await page.locator("#accessrows tr", { hasText: "cohere-site.scenius.social" }).waitFor({
    timeout: 15_000,
  });
  const serviceRow = page.locator("#accessrows tr", { hasText: "cohere-site.scenius.social" });
  expect(
    (await serviceRow.innerText()).includes("site service account"),
    "the site's own account is labelled and has no controls",
  );
  expect(
    (await serviceRow.locator("select, button").count()) === 0,
    "the protected row offers no role select and no Remove button",
  );

  step = "invite";
  await page.locator("#inviteemail").fill("rosa@example.test");
  await page.locator("#inviterole").selectOption("builder");
  await page.locator("#sendinvite").click();
  await page.locator("#accessmsg", { hasText: "Invite sent" }).waitFor({ timeout: 10_000 });
  ok("the invite reported sent");

  const lastInvite = await (await fetch(new URL("/__lastInvite", mockUrl))).json();
  expect(lastInvite.email === "rosa@example.test", "regenOS was asked to invite that address");
  expect(lastInvite.confersRole === 20, "…as a builder (confersRole 20)");
  expect(
    lastInvite.origin === "https://cohereboulder.org",
    "…with origin set, so the emailed link lands back on this site",
  );
  expect(tokenLeak === null, `the raw invite token never reached the browser${tokenLeak ? ` (leaked at ${tokenLeak})` : ""}`);

  step = "role change";
  page.once("dialog", (d) => d.accept());
  await page.locator('#accessrows select[data-role="did:plc:mockbuilder"]').selectOption("facilitator");
  await page.locator("#accessmsg", { hasText: "is now a facilitator" }).waitFor({ timeout: 10_000 });
  const roster = await (await fetch(new URL("/xrpc/social.scenius.getSceneMembers?scene=did:plc:mockscene", mockUrl))).json();
  expect(
    roster.members.some((m) => m.did === "did:plc:mockbuilder" && m.role === "facilitator"),
    "setMembership actually landed on the mock",
  );

  step = "revoke";
  page.once("dialog", (d) => d.accept());
  await page.locator('#accessrows button[data-revoke="did:plc:mockbuilder"]').click();
  await page.locator("#accessmsg", { hasText: "was removed" }).waitFor({ timeout: 10_000 });
  const afterRevoke = await (await fetch(new URL("/xrpc/social.scenius.getSceneMembers?scene=did:plc:mockscene", mockUrl))).json();
  expect(
    !afterRevoke.members.some((m) => m.did === "did:plc:mockbuilder"),
    "revokeMembership actually landed on the mock",
  );

  // ── 8. Delete ─────────────────────────────────────────────────────────────
  step = "delete";
  await openTab("Events");
  await page.locator("#eventrows tr", { hasText: renamedName }).waitFor({ timeout: 15_000 });
  await page.locator("#eventrows tr", { hasText: renamedName }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#evdelete").click();
  await page.locator("#eventmsg", { hasText: "Event deleted" }).waitFor({ timeout: 15_000 });
  expect(
    (await page.locator("#eventrows tr", { hasText: renamedName }).count()) === 0,
    "the event is off the admin list",
  );
  const afterDelete = await (await fetch(new URL("/api/events", target))).json();
  expect(
    !(afterDelete.events ?? []).some((e) => e.name === renamedName),
    "…and off the public feed",
  );

  // ── 9. A wrong service token fails honestly, and the list still works ─────
  // Same Worker, second deployment: `REGENOS_SERVICE_TOKEN` set to something
  // the AppView refuses. The list is an anonymous read and must survive; the
  // writes must answer with a sentence, not a stack trace.
  step = "wrong service token";
  const badBase = process.env.E2E_BAD_TOKEN_URL;
  if (!badBase) {
    console.log("skip  wrong-token checks (set E2E_BAD_TOKEN_URL to a wrangler dev with a bad secret)");
  } else {
    const cookie = `cohere_session=${sessionToken}`;
    const list = await fetch(new URL("/api/admin/events", badBase), { headers: { cookie } });
    expect(list.status === 200, "the events list still works — that read is anonymous");

    const write = await fetch(new URL("/api/admin/events", badBase), {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Should not land", startsAt: new Date().toISOString() }),
    });
    const writeBody = await write.json();
    expect(write.status === 400, `a write answers 400, not 500 (got ${write.status})`);
    expect(
      typeof writeBody.message === "string" && writeBody.message.includes("scope check"),
      `…carrying regenOS's own sentence: ${JSON.stringify(writeBody.message)}`,
    );
    expect(
      !JSON.stringify(writeBody).toLowerCase().includes("at worker") &&
        !JSON.stringify(writeBody).includes("stack"),
      "…and no stack trace",
    );

    const access = await fetch(new URL("/api/admin/access", badBase), { headers: { cookie } });
    expect(access.status === 503, `the roster degrades to 503 (got ${access.status})`);
  }

  // ── 10. …and a Worker with NO service token at all ────────────────────────
  step = "missing service token";
  const noTokenBase = process.env.E2E_NO_TOKEN_URL;
  if (!noTokenBase) {
    console.log("skip  missing-token checks (set E2E_NO_TOKEN_URL to a wrangler dev with no secret)");
  } else {
    const cookie = `cohere_session=${sessionToken}`;
    const list = await fetch(new URL("/api/admin/events", noTokenBase), { headers: { cookie } });
    expect(list.status === 200, "the events list still works with no service token at all");
    const write = await fetch(new URL("/api/admin/events", noTokenBase), {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Should not land", startsAt: new Date().toISOString() }),
    });
    const body = await write.json();
    expect(write.status === 503, `a write answers 503 (got ${write.status})`);
    expect(
      body.error === "Event management isn't configured on this deployment yet.",
      `…and says so plainly: ${JSON.stringify(body.error)}`,
    );
  }
} catch (error) {
  fail(error.message.split("\n")[0]);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log("\nadmin events + access e2e passed.");
