// Hermetic: local Worker + local regenOS mock only. Uses synthetic registrants.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const [target, mock, admin] = process.argv.slice(2);
assert.ok(new URL(target).hostname === "127.0.0.1" && new URL(mock).hostname === "127.0.0.1");
const persist = process.env.E2E_PERSIST_DIR;
assert.ok(persist);
const sql = command => execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "cohere", "--local", "--persist-to", persist, "--command", command], { stdio: "pipe" });
sql(`INSERT OR REPLACE INTO forms(slug,title,fields,active,created_at,updated_at) VALUES('register-2026','Join COhere','[{"key":"email","type":"email","label":"Email","required":true}]',1,'now','now')`);
const cookie = "__Host-rs_session=membership-e2e";
const configure = data => fetch(`${mock}/__membership`, { method: "POST", body: JSON.stringify(data) });
const state = async () => (await fetch(`${mock}/__membership`)).json();
const status = async () => (await fetch(`${target}/api/me/registration`, { headers: { Cookie: cookie } })).json();
const submit = email => fetch(`${target}/api/submit/register-2026`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ email, answers: {} }) });
const legacy = await fetch(`${target}/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "legacy@cohere.test" }) });
assert.equal(legacy.status, 200);
for (const scenario of ["new", "existing", "member", "steward", "failure"]) {
  sql("DELETE FROM membership_links; DELETE FROM submissions; DELETE FROM people");
  const email = `${scenario}@cohere.test`;
  await configure({ email, role: ["member", "steward"].includes(scenario) ? scenario : undefined, fail: scenario === "failure" });
  if (scenario === "new") {
    assert.equal((await status()).registered, false);
    assert.equal((await submit("tampered@cohere.test")).status, 200);
    assert.equal((await status()).registered, true);
  } else {
    // Existing registration predates account sign-in.
    sql(`INSERT INTO people(id,email,unsubscribe_token,created_at,updated_at) VALUES('existing','${email}','u','now','now'); INSERT INTO submissions(id,person_id,form_slug,data,created_at,updated_at) VALUES('s','existing','register-2026','{}','now','now')`);
  }
  const session = await fetch(`${target}/xrpc/social.scenius.getSession`, { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);
  assert.ok((await session.json()).did);
  if (scenario === "failure") {
    assert.equal((await status()).membership, "pending");
    await configure({ email });
    await fetch(`${target}/xrpc/social.scenius.getSession`, { headers: { Cookie: cookie } });
  }
  assert.equal((await status()).membership, "member");
  assert.equal((await state()).writes, ["member", "steward"].includes(scenario) ? 0 : 1);
  assert.equal((await state()).role, scenario === "steward" ? "steward" : "member");
}
assert.equal((await fetch(`${target}/api/admin/membership/dry-run`)).status, 401);
const before = await state();
const dry = await fetch(`${target}/api/admin/membership/dry-run`, { headers: { Cookie: `cohere_session=${admin}` } });
assert.equal(dry.status, 200);
assert.equal((await dry.json()).linked, 1);
assert.deepEqual(await state(), before);

const shots = process.env.JOIN_SHOTS ?? "/tmp/cohere-join-screenshots";
await mkdir(shots, { recursive: true });
const browser = await chromium.launch();
try {
  sql("DELETE FROM membership_links; DELETE FROM submissions; DELETE FROM people");
  await configure({ email: "browser@cohere.test" });
  const signupContext = await browser.newContext();
  await signupContext.addCookies([{ name: "__Host-rs_session", value: "membership-e2e", domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const signupPage = await signupContext.newPage();
  for (const pattern of ["**/api/me/registration", "**/xrpc/social.scenius.getSession", "**/api/submit/register-2026"]) {
    await signupPage.route(pattern, route => route.continue({ headers: { ...route.request().headers(), cookie } }));
  }
  await signupPage.goto(`${target}/register`, { waitUntil: "networkidle" });
  await signupPage.waitForFunction(() => document.querySelector("#field-email")?.value === "browser@cohere.test");
  assert.equal(await signupPage.locator("#field-email").getAttribute("readonly"), "");
  await signupPage.getByRole("button", { name: "Submit Registration", exact: true }).click();
  await signupPage.getByRole("heading", { name: "You're a member of COhere", exact: true }).waitFor();
  await signupContext.close();
  for (const language of ["en", "es"]) {
    const context = await browser.newContext();
    await context.addCookies([{ name: "__Host-rs_session", value: "membership-e2e", domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    // Chromium treats loopback as trustworthy; use a Secure host-only cookie.
    await page.route("**/api/me/registration", route => route.continue({ headers: { ...route.request().headers(), cookie } }));
    await page.route("**/xrpc/social.scenius.getSession", route => route.continue({ headers: { ...route.request().headers(), cookie } }));
    await page.goto(`${target}/register`, { waitUntil: "networkidle" });
    if (language === "es") await page.getByRole("button", { name: "En/Es", exact: true }).click();
    await page.getByRole("heading", { name: language === "en" ? "You're a member of COhere" : "Eres miembro de COhere" }).waitFor();
    for (const width of [390, 800, 1280]) {
      await page.setViewportSize({ width, height: 1067 });
      if (width === 800) await page.addStyleTag({ content: "html { filter: grayscale(1); }" });
      await page.screenshot({ path: `${shots}/joined-${language}-${width}.png`, fullPage: true });
      if (width === 800) await page.evaluate(() => document.querySelectorAll("style").forEach(el => { if (el.textContent.includes("grayscale")) el.remove(); }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await context.close();
  }
} finally { await browser.close(); }
console.log("Membership e2e passed; screenshots:", shots);
