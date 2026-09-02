// End-to-end proof of the "propose an event" flow, in a real browser against
// the mock AppView (scripts/regenos-mock.mjs) — a signed-out visitor
// submitting /propose, an organizer reviewing and approving/rejecting it from
// /admin's Proposals tab, and the two edges that matter most:
//
//   * approving publishes with the SAME service-token createEvent the Events
//     tab uses, and the result actually reaches the public /api/events feed;
//   * a Worker deployed with NO service token at all must refuse an approval
//     honestly (503, the same sentence handleAdminEventCreate uses) while the
//     proposals LIST keeps working, because listing never touches regenOS.
//
// Usage (four terminals, or backgrounded):
//   PORT=9946 node scripts/regenos-mock.mjs
//   npx wrangler dev --port 8796 \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9946 \
//     --var REGENOS_COLLECTIVE_DID:did:plc:mockscene \
//     --var REGENOS_SERVICE_TOKEN:mock-token
//   # a second instance with NO REGENOS_SERVICE_TOKEN var, for step 8:
//   npx wrangler dev --port 8797 \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9946 \
//     --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
//   node scripts/proposals-e2e.mjs http://127.0.0.1:8796 <session-token> \
//     http://127.0.0.1:9946 http://127.0.0.1:8797
//
// The session token is whatever you wrote into local KV — see
// scripts/admin-events-e2e.mjs's header for the exact seeding commands (same
// admins row + COHERE_AUTH session works for both scripts). Both wrangler
// dev instances need worker/schema.sql AND worker/migrations/0003_event_
// proposals.sql applied to their local D1 first.
//
// Start the mock FRESH — its calendar is in-memory, and a stale one leaves
// old proposals' events on it that a name-based assertion could confuse with.

import { chromium } from "playwright";

const target = process.argv[2];
const sessionToken = process.argv[3];
const mockUrl = process.argv[4] ?? "http://127.0.0.1:9946";
const noTokenTarget = process.argv[5];
if (!target || !sessionToken) {
  console.error(
    "usage: node scripts/proposals-e2e.mjs <wrangler-dev-url> <session-token> [mock-url] [no-token-wrangler-dev-url]",
  );
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
const eventName = `E2E Story Circle ${stamp}`;
const rejectedName = `E2E Should Be Rejected ${stamp}`;
const honeypotName = `E2E Bot Submission ${stamp}`;
const proposerEmail = `e2e-proposer-${stamp}@example.test`;

/** A datetime-local value in the browser's own zone, N days out at 18:30. */
function localDatetime(daysOut, hour = 18) {
  const d = new Date(Date.now() + daysOut * 24 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hour)}:30`;
}

const browser = await chromium.launch();

/** Public visitor: no cookie at all — this flow must not need one. */
const publicContext = await browser.newContext({ baseURL: target });
const publicPage = await publicContext.newPage();
publicPage.on("pageerror", (error) => fail(`uncaught error on /propose — ${error}`));

/** The organizer, signed in via the seeded KV session (see script header). */
const adminContext = await browser.newContext({ baseURL: target });
await adminContext.addCookies([
  { name: "cohere_session", value: sessionToken, url: target, httpOnly: true, sameSite: "Lax" },
]);
const adminPage = await adminContext.newPage();
adminPage.on("pageerror", (error) => fail(`uncaught error on /admin — ${error}`));

try {
  // ── 1. A signed-out visitor can even reach the page ────────────────────────
  step = "load /propose";
  await publicPage.goto("/propose", { waitUntil: "networkidle" });
  await publicPage.locator("#pe-name").waitFor({ state: "visible", timeout: 15_000 });
  ok("the propose form renders with no session at all");

  // ── 2. Submit a real proposal ───────────────────────────────────────────────
  step = "public submit";
  await publicPage.locator("#pe-name").fill(eventName);
  await publicPage.locator("#pe-description").fill("A slow gathering to trade stories, from the public form.");
  await publicPage.locator("#pe-starts").fill(localDatetime(12));
  await publicPage.locator("#pe-place").fill("Chautauqua Community House");
  await publicPage.locator("#pe-street").fill("900 Baseline Rd");
  await publicPage.locator("#pe-locality").fill("Boulder");
  await publicPage.locator("#pe-region").fill("CO");
  await publicPage.locator("#pe-postal").fill("80302");
  await publicPage.locator("#pe-proposer-name").fill("Rosa Rivera");
  await publicPage.locator("#pe-proposer-email").fill(proposerEmail);
  await publicPage.locator("#pe-submit").click();
  await publicPage.getByText("Thanks", { exact: false }).waitFor({ timeout: 15_000 });
  ok("the success screen appeared — no account, no regenOS, ever touched");

  // ── 3. The honeypot silently drops a bot's submission ───────────────────────
  step = "honeypot";
  const honeypotResponse = await fetch(new URL("/api/events/propose", target), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: honeypotName,
      startsAt: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      website: "http://spam.example.test", // the hidden field a bot fills
    }),
  });
  const honeypotBody = await honeypotResponse.json();
  expect(honeypotResponse.status === 200 && honeypotBody.ok === true, "the honeypot answers as if it worked");

  // ── 4. It shows up in the admin Proposals tab, pending ──────────────────────
  step = "admin proposals tab";
  await adminPage.goto("/admin", { waitUntil: "networkidle" });
  await adminPage.locator("#app").waitFor({ state: "visible", timeout: 15_000 });
  await adminPage.getByRole("tab", { name: "Proposals", exact: false }).click();
  await adminPage.locator("#proposalrows tr", { hasText: eventName }).waitFor({ timeout: 15_000 });
  ok("the pending proposal is listed");
  expect(
    (await adminPage.locator("#proposalrows").innerText()).includes(proposerEmail),
    "…with the proposer's name and email",
  );
  expect(
    (await adminPage.locator("#proposalrows").innerText()).includes(honeypotName) === false,
    "the honeypot submission never made it into the queue",
  );
  const badge = await adminPage.locator("#proposalbadge").innerText();
  expect(/^\d+$/.test(badge) && Number(badge) >= 1, `the pending-count badge shows a number (got "${badge}")`);

  // ── 5. Approve — the SAME createEvent the Events tab uses ───────────────────
  step = "approve";
  await adminPage
    .locator("#proposalrows tr", { hasText: eventName })
    .locator('[data-approve]')
    .click();
  await adminPage.locator("#proposalmsg", { hasText: "Approved and published" }).waitFor({ timeout: 15_000 });
  ok("the approve button reported success");

  const proposalsAfterApprove = await (
    await fetch(new URL("/api/admin/proposals?status=published", target), {
      headers: { cookie: `cohere_session=${sessionToken}` },
    })
  ).json();
  const published = (proposalsAfterApprove.proposals ?? []).find((p) => p.name === eventName);
  expect(Boolean(published?.published_did && published?.published_rkey), "the row now carries did + rkey");

  const publicFeed = await (await fetch(new URL("/api/events", target))).json();
  expect(
    (publicFeed.events ?? []).some((e) => e.name === eventName),
    "…and the event is on the PUBLIC /api/events feed",
  );

  // ── 6. Idempotent: approving it again doesn't mint a duplicate ─────────────
  step = "idempotent approve";
  const secondApprove = await fetch(new URL(`/api/admin/proposals/${published.id}/approve`, target), {
    method: "POST",
    headers: { cookie: `cohere_session=${sessionToken}` },
  });
  const secondBody = await secondApprove.json();
  expect(secondApprove.status === 200 && secondBody.ok === true, "a second approve still answers 200 ok");
  expect(
    secondBody.did === published.published_did && secondBody.rkey === published.published_rkey,
    "…returning the SAME did/rkey rather than creating a second event",
  );
  const feedAfterSecondApprove = await (await fetch(new URL("/api/events", target))).json();
  expect(
    (feedAfterSecondApprove.events ?? []).filter((e) => e.name === eventName).length === 1,
    "…so the public feed still has exactly one copy",
  );

  // ── 7. Reject flow, with a reason ───────────────────────────────────────────
  step = "reject";
  const rejectSubmit = await fetch(new URL("/api/events/propose", target), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: rejectedName,
      startsAt: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
      proposerEmail: `e2e-rejected-${stamp}@example.test`,
    }),
  });
  expect(rejectSubmit.ok, "seeded a second proposal to reject");

  await adminPage.reload({ waitUntil: "networkidle" });
  await adminPage.getByRole("tab", { name: "Proposals", exact: false }).click();
  await adminPage.locator("#proposalrows tr", { hasText: rejectedName }).waitFor({ timeout: 15_000 });
  adminPage.once("dialog", (d) => d.accept("not quite the right fit for this calendar"));
  await adminPage.locator("#proposalrows tr", { hasText: rejectedName }).locator("[data-reject]").click();
  await adminPage.locator("#proposalmsg", { hasText: "Rejected" }).waitFor({ timeout: 15_000 });
  ok("the reject button reported success");

  await adminPage.locator('#tab-proposals .chip[data-pstatus="rejected"]').click();
  await adminPage.locator("#proposalrows tr", { hasText: rejectedName }).waitFor({ timeout: 15_000 });
  expect(
    (await adminPage.locator("#proposalrows tr", { hasText: rejectedName }).innerText()).includes(
      "not quite the right fit",
    ),
    "the rejection note shows on the row",
  );
  const feedAfterReject = await (await fetch(new URL("/api/events", target))).json();
  expect(
    !(feedAfterReject.events ?? []).some((e) => e.name === rejectedName),
    "a rejected proposal never reaches the public calendar",
  );
  await adminPage.locator('#tab-proposals .chip[data-pstatus="pending"]').click();

  // ── 8. A Worker with NO service token refuses an approval honestly ─────────
  step = "missing service token";
  if (!noTokenTarget) {
    console.log(
      "skip  missing-token approve check (pass a fourth argument: a wrangler dev URL started with no REGENOS_SERVICE_TOKEN)",
    );
  } else {
    const cookie = `cohere_session=${sessionToken}`;
    const seedResponse = await fetch(new URL("/api/events/propose", noTokenTarget), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `E2E No Token ${stamp}`,
        startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      }),
    });
    expect(seedResponse.ok, "the propose route still works with no service token — it never touches regenOS");

    const list = await fetch(new URL("/api/admin/proposals?status=pending", noTokenTarget), { headers: { cookie } });
    const listBody = await list.json();
    expect(list.status === 200, `the proposals LIST still works (got ${list.status})`);
    const noTokenRow = (listBody.proposals ?? []).find((p) => p.name === `E2E No Token ${stamp}`);
    expect(Boolean(noTokenRow), "…and the seeded row is in it");

    if (noTokenRow) {
      const approve = await fetch(new URL(`/api/admin/proposals/${noTokenRow.id}/approve`, noTokenTarget), {
        method: "POST",
        headers: { cookie },
      });
      const approveBody = await approve.json();
      expect(approve.status === 503, `approve answers 503, not a crash (got ${approve.status})`);
      expect(
        approveBody.error === "Event management isn't configured on this deployment yet.",
        `…with the same honest sentence the Events tab's create uses: ${JSON.stringify(approveBody.error)}`,
      );
    }
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
console.log("\nproposals e2e passed.");
