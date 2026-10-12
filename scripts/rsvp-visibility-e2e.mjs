// End-to-end proof of "Who sees my RSVPs" in a real browser, against a local
// wrangler dev + the mock AppView. Never touches scenius.social.
//
//   1. an RSVP made on regenOS appears on the member's profile, for other members
//   2. the control on the calendar row hides this one RSVP; members stop seeing it
//   3. the control on the event page (inline) shows it again
//   4. the profile editor: the setting, each RSVP’s "Show on my profile" switch, the live
//      "What members see" preview, and the two honest lines
//   5. Nobody hides every RSVP; Members (the default) brings them back
//   6. email RSVPs are never on a profile; the setting is owner-only server-side;
//      signed-out and non-member callers are refused
//   7. Spanish, and a 390px phone with no sideways scroll
//
// Usage (start the mock FRESH; the D1 schema must be loaded):
//   PORT=9944 node scripts/regenos-mock.mjs
//   npx wrangler dev --port 8787 --var REGENOS_LOGIN_ENABLED:true \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9944 --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
//   node scripts/rsvp-visibility-e2e.mjs http://127.0.0.1:8787

import { chromium } from "playwright";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/rsvp-visibility-e2e.mjs <wrangler-dev-url>");
  process.exit(2);
}

const failures = [];
let step = "";
const ok = (m) => console.log(`ok    ${m}`);
const fail = (m) => { failures.push(`${step}: ${m}`); console.error(`FAIL  ${step}: ${m}`); };
const expect = (c, m) => (c ? ok(m) : fail(m));
const stamp = Date.now().toString(36);
const ME = "did:plc:mockuser";
const EVENT = "Seed Gathering";

const browser = await chromium.launch();
const pages = [];
async function persona(cookieValue, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ baseURL: target, viewport });
  if (cookieValue) {
    await context.addCookies([{ name: "__Host-rs_session", value: cookieValue, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  }
  const page = await context.newPage();
  page.on("pageerror", (e) => fail(`uncaught page error — ${e}`));
  pages.push(page);
  return { context, page };
}
/** What a member sees on ME's profile page right now. */
async function goingOnProfile(page) {
  await page.goto(`/people/${encodeURIComponent(ME)}`, { waitUntil: "networkidle" });
  await page.getByTestId("person").waitFor({ timeout: 15_000 });
  await page.getByTestId("person-going").locator("[role=status]").waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
  return page.getByTestId("person-going").getByTestId("going-event").allInnerTexts();
}
const seeEvent = (texts) => texts.some((t) => t.includes(EVENT));

try {
  const me = await persona("sess-1");
  const mp = me.page;
  const peer = await persona("mock-peer");
  const pp = peer.page;

  // The mock user needs a profile to be found; the RSVP is made through the real UI.
  step = "setup";
  await mp.goto("/profile", { waitUntil: "networkidle" });
  await mp.locator("#pf-name").fill(`Sam ${stamp}`);
  await mp.getByRole("button", { name: "Save profile" }).click();
  await mp.getByText("Saved. Members can see it now.").waitFor({ timeout: 10_000 });

  step = "default";
  await mp.goto("/calendar", { waitUntil: "networkidle" });
  const everyDate = mp.getByRole("button", { name: "Show every upcoming date" });
  if (await everyDate.count()) await everyDate.click();
  const card = mp.getByTestId("event-card").filter({ hasText: EVENT });
  await card.waitFor({ timeout: 15_000 });
  expect(!(await card.getByTestId("rsvp-privacy").count()), "no privacy control before there is an RSVP");
  await card.getByTestId("card-rsvp").click();
  await card.getByTestId("rsvp-privacy").waitFor({ timeout: 10_000 });
  expect((await card.getByTestId("rsvp-privacy").innerText()).includes("Shown on your profile · change"), "after RSVPing the row says 'Shown on your profile · change'");
  expect(seeEvent(await goingOnProfile(pp)), "another member sees the RSVP on the profile by default");

  // ── 2. hide from the calendar row ─────────────────────────────────────────
  step = "hide from the row";
  await mp.goto("/calendar", { waitUntil: "networkidle" });
  if (await everyDate.count()) await everyDate.click();
  const row = mp.getByTestId("event-card").filter({ hasText: EVENT });
  await row.getByTestId("rsvp-privacy").getByRole("button").click();
  const panel = mp.getByTestId("rsvp-privacy-panel");
  await panel.waitFor();
  expect((await panel.innerText()).includes("COhere members can see on your profile that you’re going."), "the sheet says plainly what members see");
  await panel.getByRole("switch", { name: "Show on my profile" }).click();
  await panel.getByText("Hidden from your profile.").waitFor({ timeout: 10_000 });
  await panel.getByRole("button", { name: "Done" }).click();
  expect((await row.getByTestId("rsvp-privacy").innerText()).includes("Hidden from your profile · change"), "the row now says 'Hidden from your profile · change'");
  expect(!seeEvent(await goingOnProfile(pp)), "members no longer see the hidden RSVP");
  const stillGoing = await mp.evaluate(async () => (await (await fetch("/xrpc/social.scenius.getEventAttendance?eventDid=did:plc:mockscene&eventRkey=ev-seed1")).json()).mySeat);
  expect(stillGoing === "confirmed", "hiding does not cancel the RSVP itself");

  // ── 3. show again from the event page ─────────────────────────────────────
  step = "show from the event page";
  await mp.goto("/events/did%3Aplc%3Amockscene/ev-seed1", { waitUntil: "networkidle" });
  const control = mp.getByTestId("rsvp-privacy");
  await control.waitFor({ timeout: 15_000 });
  expect((await control.innerText()).includes("Hidden from your profile · change"), "the event page shows the same state");
  await control.getByRole("button").click();
  await mp.getByTestId("rsvp-privacy-panel").getByRole("switch", { name: "Show on my profile" }).click();
  await mp.getByTestId("rsvp-privacy-panel").getByText("COhere members can see on your profile that you’re going.").waitFor({ timeout: 10_000 });
  expect(seeEvent(await goingOnProfile(pp)), "members see it again");

  // ── 4. the editor ─────────────────────────────────────────────────────────
  step = "editor";
  await mp.goto("/profile#rsvps", { waitUntil: "networkidle" });
  const section = mp.getByTestId("rsvp-visibility");
  await section.waitFor({ timeout: 15_000 });
  expect(await section.getByTestId("rsvp-mode-members").getAttribute("aria-pressed") === "true", "Members is the default");
  expect((await section.innerText()).includes("is public on scenius.social"), "the editor says the scenius.social RSVP stays public there");
  expect((await section.innerText()).includes("never shown on a profile"), "the editor says email RSVPs never show on a profile");
  const mine = section.getByTestId("my-rsvp").filter({ hasText: EVENT });
  await mine.waitFor();
  expect((await section.getByTestId("rsvp-preview").innerText()).includes(EVENT), "the live preview lists the event");
  await mine.getByRole("switch", { name: /Show Seed Gathering/ }).click();
  await section.getByTestId("rsvp-preview").getByText("Nothing. Your profile shows no events.").waitFor({ timeout: 10_000 });
  ok("hiding one in the editor updates the preview straight away");
  expect(!seeEvent(await goingOnProfile(pp)), "…and members stop seeing it");
  await mp.goto("/profile#rsvps", { waitUntil: "networkidle" });
  await mp.getByTestId("my-rsvp").filter({ hasText: EVENT }).getByRole("switch", { name: /Show Seed Gathering/ }).click();
  await mp.getByTestId("rsvp-preview").getByTestId("going-event").waitFor({ timeout: 10_000 });
  ok("toggling it back shows it again");

  // ── 5. Nobody / Members ───────────────────────────────────────────────────
  step = "nobody";
  await mp.getByTestId("rsvp-mode-nobody").click();
  await mp.getByTestId("rsvp-preview").getByText("Nothing. Your profile shows no events.").waitFor({ timeout: 10_000 });
  expect(await mp.getByTestId("my-rsvp").getByRole("switch").first().isDisabled(), "with Nobody chosen, the per-event toggles are disabled");
  expect(!seeEvent(await goingOnProfile(pp)), "Nobody: members see no RSVPs");
  await mp.goto("/calendar", { waitUntil: "networkidle" });
  if (await everyDate.count()) await everyDate.click();
  expect((await mp.getByTestId("event-card").filter({ hasText: EVENT }).getByTestId("rsvp-privacy").innerText()).includes("Not on your profile · change"), "the row says so too");
  await mp.goto("/profile#rsvps", { waitUntil: "networkidle" });
  await mp.getByTestId("rsvp-mode-members").click();
  await mp.getByTestId("rsvp-preview").getByTestId("going-event").waitFor({ timeout: 10_000 });
  expect(seeEvent(await goingOnProfile(pp)), "Members: they are back");

  // ── 6. what must not happen ───────────────────────────────────────────────
  step = "guards";
  const rosa = await persona("mock-builder");
  await rosa.page.goto("/", { waitUntil: "networkidle" });
  const emailRsvp = await rosa.page.evaluate(async () => (await fetch("/api/rsvp", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ did: "did:plc:mockscene", rkey: "ev-seed1", email: "rosa-e2e@example.org", name: "Rosa Mock" }),
  })).status);
  expect(emailRsvp === 200, "an email RSVP was made in Rosa's name");
  const rosaPage = await pp.evaluate(async () => (await (await fetch("/api/members/did%3Aplc%3Amockbuilder/rsvps")).json()).rsvps.length);
  expect(rosaPage === 0, "an email RSVP is never shown on a profile");
  await pp.evaluate(() => fetch("/api/me/rsvp-visibility", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "nobody", did: "did:plc:mockuser" }) }));
  const mineStill = await mp.evaluate(async () => (await (await fetch("/api/me/rsvp-visibility")).json()).mode);
  expect(mineStill === "members", "a body-supplied DID can't change someone else's setting");
  const peerNow = await pp.evaluate(async () => (await (await fetch("/api/me/rsvp-visibility")).json()).mode);
  expect(peerNow === "nobody", "…it only changed the caller's own");
  const anonCtx = await persona(null);
  const anon = await anonCtx.page.request.get("/api/members/did%3Aplc%3Amockuser/rsvps");
  expect(anon.status() === 401, "signed out: 401");
  const outsider = await persona("mock-outsider");
  await outsider.page.goto("/", { waitUntil: "networkidle" });
  const out = await outsider.page.evaluate(async () => (await fetch("/api/members/did%3Aplc%3Amockuser/rsvps")).status);
  expect(out === 403, "signed in but not a member: 403");

  // ── 7. Spanish, phone ─────────────────────────────────────────────────────
  step = "spanish and phone";
  await mp.goto("/profile#rsvps", { waitUntil: "networkidle" });
  await mp.getByRole("button", { name: "Es", exact: true }).filter({ visible: true }).first().click();
  await mp.getByRole("heading", { name: "Quién ve mis RSVP" }).waitFor();
  ok("the RSVP settings speak Spanish");
  const phone = await persona("sess-1", { width: 390, height: 844 });
  for (const path of ["/profile#rsvps", `/people/${encodeURIComponent(ME)}`, "/calendar"]) {
    await phone.page.goto(path, { waitUntil: "networkidle" });
    await phone.page.locator("main h1").first().waitFor({ timeout: 10_000 });
    await phone.page.waitForTimeout(500);
    const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow <= 0, `390px: ${path} has no horizontal scroll`);
  }
} catch (error) {
  fail(`unexpected: ${error}`);
  for (const [i, p] of pages.entries()) await p.screenshot({ path: `/tmp/rsvpvis-e2e-fail-${i}.png`, fullPage: true }).catch(() => {});
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nrsvp-visibility-e2e passed");
