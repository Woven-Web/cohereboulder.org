// End-to-end proof of the members directory and profiles in a real browser,
// against a local wrangler dev + the mock AppView (scripts/regenos-mock.mjs).
//
//   1. signed out / not a member: the gate — no names, no count, no list
//   2. a member sees the directory with both profile sources marked, searches it
//      (accent- and case-insensitive), and opens a profile
//   3. a profile editor: counters, unsafe links refused, a saved profile shows up
//      in the directory and on the Board (as the author's name)
//   4. switching back to the public profile (confirm sheet) restores the fallback
//   5. the proxy refuses non-web links in a profile written straight to it
//   6. Spanish, a 390px phone with no sideways scroll, no page errors
//
// Usage (start the mock FRESH):
//   PORT=9944 node scripts/regenos-mock.mjs
//   npx wrangler dev --port 8787 --var REGENOS_LOGIN_ENABLED:true \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9944 --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
//   node scripts/people-e2e.mjs http://127.0.0.1:8787

import { chromium } from "playwright";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/people-e2e.mjs <wrangler-dev-url>");
  process.exit(2);
}

const failures = [];
let step = "";
const ok = (m) => console.log(`ok    ${m}`);
const fail = (m) => { failures.push(`${step}: ${m}`); console.error(`FAIL  ${step}: ${m}`); };
const expect = (c, m) => (c ? ok(m) : fail(m));
const stamp = Date.now().toString(36);

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
  return page;
}
const rows = (page) => page.getByTestId("person-row");

try {
  // ── 1. the gate ───────────────────────────────────────────────────────────
  step = "gate";
  const anon = await persona(null);
  await anon.goto("/people", { waitUntil: "networkidle" });
  await anon.locator('[data-gate="signed-out"]').waitFor({ timeout: 15_000 });
  expect((await rows(anon).count()) === 0 && !(await anon.getByText("Pia Mock").count()), "signed out: no names in the page");
  expect(!(await anon.getByText(/\d+ people/).count()), "signed out: no count");
  const outsider = await persona("mock-outsider");
  await outsider.goto("/people", { waitUntil: "networkidle" });
  await outsider.locator('[data-gate="not-member"]').waitFor({ timeout: 15_000 });
  expect((await rows(outsider).count()) === 0 && !(await outsider.getByText("Pia Mock").count()), "not a member: the gate, not a list");
  const direct = await outsider.evaluate(async () => {
    const res = await fetch("/xrpc/social.scenius.listCircleProfiles?collective=did:plc:mockscene");
    return { status: res.status, body: await res.text() };
  });
  expect(direct.status === 403 && !direct.body.includes("Pia Mock"), "the proxy refuses a non-member outright (403, no names)");

  // ── 2. directory ──────────────────────────────────────────────────────────
  step = "directory";
  const me = await persona("sess-1");
  await me.goto("/people", { waitUntil: "networkidle" });
  await rows(me).first().waitFor({ timeout: 15_000 });
  expect((await rows(me).count()) === 2, "two profiles listed (the mock user has none yet)");
  expect(await me.getByText("2 people").isVisible(), "the count line says 2 people");
  expect(await me.getByText("1 showing a public profile").isVisible(), "…and that one is a public profile");
  expect(await rows(me).filter({ hasText: "Pia Mock" }).getByText("COhere profile").isVisible(), "Pia is marked 'COhere profile'");
  expect(await rows(me).filter({ hasText: "Rosa Mock" }).getByText("Public · scenius.social").isVisible(), "Rosa is marked 'Public · scenius.social'");
  await me.getByRole("searchbox", { name: "Search people" }).fill("ROSÁ");
  expect((await rows(me).count()) === 1 && (await rows(me).first().innerText()).includes("Rosa"), "search ignores case and accents");
  await me.getByRole("searchbox", { name: "Search people" }).fill("squash");
  expect((await rows(me).count()) === 1 && (await rows(me).first().innerText()).includes("Pia"), "search reaches into bios");
  await me.getByRole("searchbox", { name: "Search people" }).fill("zzzz");
  await me.getByText("Nobody matches yet.").waitFor();
  await me.getByRole("button", { name: "Clear search" }).click();
  expect((await rows(me).count()) === 2, "Clear search restores the list");

  await rows(me).filter({ hasText: "Pia Mock" }).click();
  await me.getByTestId("person").waitFor();
  expect(await me.getByText("I keep bees near Lyons").isVisible(), "the profile shows the bio");
  const link = me.getByRole("link", { name: "example.org/pia" });
  expect((await link.getAttribute("rel"))?.includes("noopener"), "profile links open with noopener");
  expect(await me.getByText("Nothing here is public.").isVisible(), "the profile says who can see it");
  await me.goto("/people", { waitUntil: "networkidle" });
  await rows(me).filter({ hasText: "Rosa Mock" }).click();
  await me.getByText("This is their public scenius.social profile.").waitFor();
  ok("a public-fallback profile says so");

  // ── 3. the editor ─────────────────────────────────────────────────────────
  step = "editor";
  await me.goto("/profile", { waitUntil: "networkidle" });
  await me.locator("#pf-name").waitFor({ timeout: 10_000 });
  await me.getByRole("button", { name: "Save profile" }).click();
  await me.getByText("Add a name first.").first().waitFor();
  ok("saving without a name is refused inline");
  await me.locator("#pf-name").fill(`Sam ${stamp}`);
  await me.locator("#pf-bio").fill("x".repeat(257));
  expect((await me.getByTestId("bio-count").innerText()).includes("257 of 256"), "the bio counter shows 257 of 256");
  expect(await me.getByRole("button", { name: "Save profile" }).isDisabled(), "over the limit, Save is disabled");
  await me.locator("#pf-bio").fill(`Planting garlic ${stamp}`);
  await me.locator('input[placeholder="https://"]').first().fill("javascript:alert(1)");
  await me.getByRole("button", { name: "Save profile" }).click();
  await me.getByText(/Only web \(https\) links can be shown/).waitFor();
  ok("a javascript: link is refused with a plain sentence");
  await me.locator('input[placeholder="https://"]').first().fill("example.com/farm");
  await me.getByRole("button", { name: "Save profile" }).click();
  await me.getByText("Saved. Members can see it now.").waitFor({ timeout: 10_000 });
  ok("a profile saves");

  await me.goto("/people", { waitUntil: "networkidle" });
  await rows(me).first().waitFor();
  expect((await rows(me).count()) === 3, "the directory now lists three");
  const mine = rows(me).filter({ hasText: `Sam ${stamp}` });
  expect(await mine.getByText("You").isVisible() && await mine.getByText("COhere profile").isVisible(), "my own row carries You and COhere profile");
  await mine.click();
  await me.getByRole("link", { name: "example.com/farm" }).waitFor();
  expect((await me.getByRole("link", { name: "example.com/farm" }).getAttribute("href")) === "https://example.com/farm", "the link was completed to https");

  await me.goto("/board", { waitUntil: "networkidle" });
  await me.getByTestId("board-post").first().waitFor({ timeout: 10_000 });
  expect(await me.getByTestId("board-post").filter({ hasText: "Spare squash" }).getByText("Pia Mock").isVisible(), "the Board shows the author's profile name");

  // ── 3b. profile extras: bringing / offering / curious ─────────────────────
  step = "profile extras";
  await me.goto("/profile", { waitUntil: "networkidle" });
  await me.locator("#pf-bringing").waitFor({ timeout: 10_000 });
  expect(await me.getByLabel("Bringing", { exact: true }).isVisible() && await me.getByLabel("Offering", { exact: true }).isVisible() && await me.getByLabel("Curious about", { exact: true }).isVisible(), "the editor has Bringing, Offering and Curious about");
  expect(!(await me.locator("#pf-bringing").getAttribute("placeholder")), "the inputs have no placeholder text");
  await me.waitForFunction(() => !document.querySelector("#pf-bringing")?.disabled);
  await me.locator("#pf-bringing").fill(`Sourdough ${stamp}`);
  await me.locator("#pf-offering").fill("Rides from the Longmont bus");
  await me.locator("#pf-curious").fill("a".repeat(121));
  expect(await me.getByRole("button", { name: "Save profile" }).isDisabled(), "a 121-character line disables Save");
  await me.locator("#pf-curious").fill("Mushroom foraging");
  await me.getByRole("button", { name: "Save profile" }).click();
  await me.getByText("Saved. Members can see it now.").waitFor({ timeout: 10_000 });
  await me.goto("/people", { waitUntil: "networkidle" });
  await rows(me).first().waitFor();
  await rows(me).filter({ hasText: `Sam ${stamp}` }).getByTestId("line-offering").waitFor();
  ok("the lines show on the member's card");
  await me.getByRole("searchbox", { name: "Search people" }).fill("longmont");
  expect((await rows(me).count()) === 1 && (await rows(me).first().innerText()).includes(`Sam ${stamp}`), "search finds a member by what they offer");
  await me.getByTestId("chip-bringing").click();
  expect((await rows(me).count()) === 0, "with the Bringing chip, text from Offering no longer matches");
  await me.getByRole("searchbox", { name: "Search people" }).fill("sourdough");
  expect((await rows(me).count()) === 1, "…while text from Bringing does");
  await me.getByRole("searchbox", { name: "Search people" }).fill("");
  expect((await rows(me).count()) === 1, "a chip alone lists whoever filled that line in");
  await me.getByTestId("chip-bringing").click();
  await rows(me).filter({ hasText: `Sam ${stamp}` }).click();
  await me.getByTestId("person-extras").getByText("Mushroom foraging").waitFor();
  ok("the profile page shows the lines");
  const gated = await outsider.evaluate(async () => {
    const list = await fetch("/api/members/profile-extras");
    const write = await fetch("/api/me/profile-extras", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ bringing: "x" }) });
    return { list: list.status, write: write.status, body: await list.text() };
  });
  expect(gated.list === 403 && gated.write === 403 && !gated.body.includes("Sourdough"), "an outsider is refused both reading and writing (403)");

  // ── 4. back to the public profile ─────────────────────────────────────────
  step = "public fallback";
  const rosa = await persona("mock-builder");
  await rosa.goto("/profile", { waitUntil: "networkidle" });
  await rosa.locator("#pf-name").waitFor({ timeout: 10_000 });
  expect((await rosa.locator("#pf-name").inputValue()) === "Rosa Mock", "Rosa's editor starts from the public profile she shows now");
  await rosa.locator("#pf-name").fill(`Rosa Wild ${stamp}`);
  await rosa.getByRole("button", { name: "Save profile" }).click();
  await rosa.getByText("Saved. Members can see it now.").waitFor({ timeout: 10_000 });
  await rosa.goto("/people", { waitUntil: "networkidle" });
  await rows(rosa).filter({ hasText: `Rosa Wild ${stamp}` }).getByText("COhere profile").waitFor();
  await rosa.goto("/profile", { waitUntil: "networkidle" });
  await rosa.getByTestId("mode-public").click();
  await rosa.getByRole("button", { name: "Delete and use public" }).click();
  await rosa.getByText("Done. Members now see your public profile.").waitFor({ timeout: 10_000 });
  await rosa.goto("/people", { waitUntil: "networkidle" });
  await rows(rosa).filter({ hasText: "Rosa Mock" }).getByText("Public · scenius.social").waitFor({ timeout: 10_000 });
  ok("deleting the COhere profile brings back the public fallback");

  // ── 5. the proxy refuses unsafe links ─────────────────────────────────────
  step = "proxy";
  const bad = await me.evaluate(async () => (await fetch("/xrpc/social.scenius.putCircleProfile", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ collective: "did:plc:mockscene", profile: { displayName: "x", links: ["javascript:alert(1)"], createdAt: new Date().toISOString() } }),
  })).status);
  expect(bad === 400, "a javascript: link written straight to the proxy is refused (400)");

  // ── 6. Spanish and phone ──────────────────────────────────────────────────
  step = "spanish and phone";
  await me.goto("/people", { waitUntil: "networkidle" });
  await me.getByRole("button", { name: "Es", exact: true }).filter({ visible: true }).first().click();
  await me.getByRole("heading", { name: "Gente" }).waitFor();
  await me.getByText("Perfil COhere").first().waitFor();
  ok("People speaks Spanish");
  const phone = await persona("sess-1", { width: 390, height: 844 });
  for (const path of ["/people", "/profile", "/board"]) {
    await phone.goto(path, { waitUntil: "networkidle" });
    await phone.locator("main h1").first().waitFor({ timeout: 10_000 });
    await phone.waitForTimeout(400);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow <= 0, `390px: ${path} has no horizontal scroll`);
  }
} catch (error) {
  fail(`unexpected: ${error}`);
  for (const [i, p] of pages.entries()) await p.screenshot({ path: `/tmp/people-e2e-fail-${i}.png`, fullPage: true }).catch(() => {});
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\npeople-e2e passed");
