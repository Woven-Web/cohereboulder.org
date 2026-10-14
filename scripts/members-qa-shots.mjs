// Visual QA of the signed-in members area against a LOCAL wrangler dev + the
// mock AppView started with MOCK_RICH_SEED=1 (scripts/regenos-mock.mjs). Never
// touches scenius.social. Writes PNGs at 360, 390 and 1600x1200.
//
// Usage: node scripts/members-qa-shots.mjs <wrangler-dev-url> <admin-session-token> <out-dir> [suffix]
import { chromium } from "playwright";
import fs from "node:fs";

const [target, adminToken, out, suffix = ""] = process.argv.slice(2);
if (!target || !adminToken || !out) {
  console.error("usage: node scripts/members-qa-shots.mjs <url> <admin-token> <out-dir> [suffix]");
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const SCENE = "did:plc:mockscene";
const VIEWPORTS = [
  { w: 360, h: 780 },
  { w: 390, h: 844 },
  { w: 1600, h: 1200 },
];
const browser = await chromium.launch();
const problems = [];

async function persona(cookie, vp, { admin = false } = {}) {
  const context = await browser.newContext({ baseURL: target, viewport: { width: vp.w, height: vp.h } });
  const cookies = [];
  if (cookie) cookies.push({ name: "__Host-rs_session", value: cookie, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
  if (admin) cookies.push({ name: "cohere_session", value: adminToken, url: target, httpOnly: true, sameSite: "Lax" });
  if (cookies.length) await context.addCookies(cookies);
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`pageerror ${e}`));
  return page;
}
const post = (page, path, body) => page.evaluate(async ([p, b]) => (await fetch(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).status, [path, body]);

for (const vp of VIEWPORTS) {
  const tag = `${vp.w}x${vp.h}`;
  const shot = async (page, name, { full = true } = {}) => {
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) problems.push(`${name}-${tag}: sideways overflow ${overflow}px`);
    await page.screenshot({ path: `${out}/${name}-${tag}${suffix}.png`, fullPage: full });
  };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { problems.push(`${name}-${tag}: ${String(e).split("\n")[0]}`); }
  };

  const me = await persona("sess-1", vp);
  await me.goto("/calendar", { waitUntil: "networkidle" });
  // RSVP on regenOS for both events, a COhere profile for the member.
  await post(me, "/xrpc/social.scenius.rsvp", { eventRkey: "ev-seed1", intent: "going" });
  await post(me, "/xrpc/social.scenius.rsvp", { eventRkey: "ev-rich3", intent: "going" });
  await post(me, "/xrpc/social.scenius.putCircleProfile", { collective: SCENE, profile: { displayName: "Tess Tester", bio: "I help with the dish pit and the sound check. Ask me about the lost-and-found box.", links: ["https://example.org/tess"], createdAt: "2026-09-04T00:00:00.000Z" } });

  await step("board", async () => { await me.goto("/board", { waitUntil: "networkidle" }); await me.getByTestId("board-post").first().waitFor(); await shot(me, "board"); });
  await step("thread", async () => {
    await me.goto("/board", { waitUntil: "networkidle" });
    await me.getByRole("link", { name: "Seats to Saturday" }).first().click();
    await me.getByTestId("board-reply").first().waitFor();
    await shot(me, "thread");
  });
  await step("compose", async () => {
    await me.goto("/board", { waitUntil: "networkidle" });
    await me.getByRole("button", { name: "Write a post" }).filter({ visible: true }).first().click();
    await me.getByRole("button", { name: "Post to the board" }).waitFor();
    await shot(me, "compose", { full: false });
  });
  await step("report", async () => {
    await me.goto("/board", { waitUntil: "networkidle" });
    await me.getByTestId("board-post").filter({ hasText: "Spare squash" }).getByRole("button", { name: "Report" }).click();
    await me.getByRole("button", { name: "Send report" }).waitFor();
    await shot(me, "report", { full: false });
  });
  await step("people", async () => { await me.goto("/people", { waitUntil: "networkidle" }); await me.getByTestId("person-row").first().waitFor(); await shot(me, "people"); });

  const profile = async (name, did, session = me) => step(name, async () => {
    await session.goto(`/people/${encodeURIComponent(did)}`, { waitUntil: "networkidle" });
    await session.waitForTimeout(800);
    await shot(session, name);
  });
  await profile("profile-rsvps", "did:plc:mockmara"); // nobody — see seeding in the README
  await profile("profile-nobody", "did:plc:mockmara");
  await profile("profile-onehidden", "did:plc:mockteo");
  await profile("profile-with-rsvps", "did:plc:mocklin");
  await profile("profile-public-only", "did:plc:mockbuilder");
  await profile("profile-me", "did:plc:mockuser");

  await step("profile-editor", async () => { await me.goto("/profile", { waitUntil: "networkidle" }); await me.getByTestId("rsvp-visibility").waitFor(); await shot(me, "profile-editor"); });
  await step("profile-editor-rsvps", async () => {
    await me.goto("/profile#rsvps", { waitUntil: "networkidle" });
    await me.getByTestId("my-rsvp").first().waitFor();
    await me.getByTestId("rsvp-visibility").scrollIntoViewIfNeeded();
    await shot(me, "profile-editor-rsvps", { full: false });
  });
  await step("event-rsvp", async () => {
    await me.goto(`/events/${SCENE}/ev-seed1`, { waitUntil: "networkidle" });
    await me.getByTestId("rsvp-privacy").waitFor();
    await shot(me, "event-rsvp");
    await me.getByTestId("rsvp-privacy").getByRole("button").first().click();
    await me.getByTestId("rsvp-privacy-panel").waitFor();
    await shot(me, "event-rsvp-open");
  });
  await step("calendar-row", async () => {
    await me.goto("/calendar", { waitUntil: "networkidle" });
    await me.getByTestId("rsvp-privacy").first().waitFor();
    await shot(me, "calendar-row");
    await me.getByTestId("rsvp-privacy").first().getByRole("button").first().click();
    await me.getByTestId("rsvp-privacy-panel").waitFor();
    await shot(me, "calendar-row-sheet", { full: false });
  });

  const outsider = await persona("mock-outsider", vp);
  await step("outsider-board", async () => { await outsider.goto("/board", { waitUntil: "networkidle" }); await outsider.locator('[data-gate]').first().waitFor(); await shot(outsider, "outsider-board"); });
  await step("outsider-people", async () => { await outsider.goto("/people", { waitUntil: "networkidle" }); await outsider.locator('[data-gate]').first().waitFor(); await shot(outsider, "outsider-people"); });
  const anon = await persona(null, vp);
  await step("signedout-board", async () => { await anon.goto("/board", { waitUntil: "networkidle" }); await anon.locator('[data-gate]').first().waitFor(); await shot(anon, "signedout-board"); });

  // /admin → Board. Reports come from two members.
  const peer = await persona("mock-peer", vp);
  await peer.goto("/board", { waitUntil: "networkidle" });
  const admin = await persona(null, vp, { admin: true });
  await step("admin-board", async () => {
    await admin.goto("/admin", { waitUntil: "networkidle" });
    await admin.getByRole("tab", { name: /^Board/ }).click();
    await admin.waitForTimeout(800);
    await shot(admin, "admin-board");
  });
  await step("admin-remove-confirm", async () => {
    const row = admin.locator("#boardreports tr").first();
    await row.getByRole("button", { name: "Remove" }).click();
    await admin.waitForTimeout(400);
    await shot(admin, "admin-remove-confirm", { full: false });
  });
}
await browser.close();
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no problems");
