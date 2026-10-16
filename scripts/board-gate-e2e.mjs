// The Board gate for a registered person who is not on the members roster
// (seen live 2026-10-16: Board → "register" → /register said "update" → Board
// showed the same gate forever). Real browser, wrangler dev + regenos-mock.
//
//   grants  mode: auto-membership works (mock allows setMembership to add) →
//                 sess-registrant opens Board and is in, no reload, no /register
//   fails   mode: setMembership is refused → the gate says they are registered
//                 and being set up, with no Register button or link to /register
//
// Seeded by scripts/ci-e2e.sh (reg@cohere.test registered; AUTO_MEMBER_ON_SIGNIN on).
// Usage: node scripts/board-gate-e2e.mjs <worker-url> <mock-url> grants|fails

import { chromium } from "playwright";

const [target, mock, mode] = process.argv.slice(2);
if (!target || !mock || !["grants", "fails"].includes(mode)) {
  console.error("usage: node scripts/board-gate-e2e.mjs <worker-url> <mock-url> grants|fails");
  process.exit(2);
}
const ok = (m) => console.log(`  ✓ ${m}`);
const expect = (c, m) => { if (!c) throw new Error(m); };

async function roleOf(did) {
  const data = await (await fetch(`${mock}/xrpc/social.scenius.getSceneMembers?scene=did:plc:mockscene`)).json();
  return data.members.find((m) => m.did === did)?.role ?? null;
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
  await context.addCookies([{ name: "__Host-rs_session", value: "sess-registrant", domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect((await roleOf("did:plc:mockregistrant")) === null, "precondition: registrant is not on the roster");

  await page.goto(`${target}/board`, { waitUntil: "networkidle" });
  if (mode === "grants") {
    await page.getByTestId("board-empty").or(page.getByRole("button", { name: /write a post/i })).first().waitFor({ timeout: 20_000 });
    expect((await page.getByTestId("members-gate").count()) === 0, "no gate once the grant lands");
    expect(page.url().includes("/board"), "stayed on the Board");
    expect((await roleOf("did:plc:mockregistrant")) === "member", "registrant is now a member");
    ok("registered non-member opens Board and gets in without a reload");
  } else {
    const gate = page.getByTestId("members-gate");
    await gate.waitFor({ timeout: 20_000 });
    expect((await gate.getAttribute("data-gate")) === "registered-not-member", `gate is ${await gate.getAttribute("data-gate")}`);
    expect((await gate.locator('a[href="/register"]').count()) === 0, "no link to /register");
    expect((await gate.getByRole("button", { name: /register/i }).count()) === 0, "no Register button");
    expect(/Registered\. Membership is being set up|You.re registered/i.test((await gate.textContent()) ?? ""), "registered text shown");
    await page.waitForTimeout(1500);
    expect((await gate.getAttribute("data-gate")) === "registered-not-member", "gate is stable, not a loop");
    expect((await roleOf("did:plc:mockregistrant")) === null, "still not on the roster");
    ok("grant refused: gate says registered, being set up; no Register button, no loop");
  }
  expect(errors.length === 0, `page errors: ${errors.join("; ")}`);
  await context.close();
  console.log(`board-gate-e2e (${mode}) passed`);
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
