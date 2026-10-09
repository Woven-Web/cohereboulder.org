// Browser proof that the admin portal is reachable and looks like the site:
// a builder sees "Organizer" in the header (desktop and phone menu) and gets to
// /admin; a plain member and a signed-out visitor see no such link; /admin has
// no horizontal overflow at 360px. Saves screenshots of /admin (desktop and
// phone) to $E2E_SHOT_DIR (default /home/uni/.hermes/cache/scratch/adminui).
// Runs against the mock AppView (scripts/regenos-mock.mjs), never scenius.social.
//
// Usage (scripts/ci-e2e.sh lane 7 runs exactly this; needs `npm run build` first):
//   node scripts/admin-ui-e2e.mjs <worker-url>
// The Worker must have REGENOS_LOGIN_ENABLED:true and the mock's scene/token vars.

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const [target] = process.argv.slice(2);
if (!target) {
  console.error("usage: node scripts/admin-ui-e2e.mjs <worker-url>");
  process.exit(2);
}
const shots = process.env.E2E_SHOT_DIR || "/home/uni/.hermes/cache/scratch/adminui";
mkdirSync(shots, { recursive: true });

const failures = [];
let step = "";
function expect(condition, message) {
  if (condition) console.log(`ok    ${message}`);
  else {
    failures.push(`${step}: ${message}`);
    console.error(`FAIL  ${step}: ${message}`);
  }
}

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 360, height: 740 };
const host = new URL(target).hostname;

async function visitor(browser, session, viewport) {
  const context = await browser.newContext({ viewport });
  if (session) await context.addCookies([{ name: "__Host-rs_session", value: session, domain: host, path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  return { context, page: await context.newPage() };
}

const adminLinks = (page) => page.locator('nav a[href="/admin"]');

const browser = await chromium.launch();
try {
  step = "builder, desktop";
  {
    const { context, page } = await visitor(browser, "sess-builder", DESKTOP);
    await page.goto(new URL("/", target).href, { waitUntil: "load" });
    await adminLinks(page).first().waitFor({ timeout: 15000 });
    expect(await adminLinks(page).first().isVisible(), "a builder sees the Organizer link in the header");
    expect((await adminLinks(page).first().textContent())?.trim() === "Organizer", "…labelled Organizer");
    await adminLinks(page).first().click();
    await page.waitForURL((u) => u.pathname === "/admin", { timeout: 15000 });
    await page.locator("#app:not(.hidden)").waitFor({ timeout: 15000 });
    expect(true, "…and it reaches the portal");
    expect(await page.locator(".site-nav .logo").isVisible(), "the portal carries the site header");
    await page.locator('.site-links a[href="/calendar"]').click();
    await page.waitForURL((u) => u.pathname === "/calendar");
    expect(true, "a header link goes back to the site");
    await context.close();
  }

  step = "builder, phone menu";
  {
    const { context, page } = await visitor(browser, "sess-builder", PHONE);
    await page.goto(new URL("/", target).href, { waitUntil: "load" });
    await page.getByRole("button", { name: "Open menu" }).click();
    const link = page.locator('nav a[href="/admin"]:visible');
    await link.first().waitFor({ timeout: 15000 });
    expect(await link.first().isVisible(), "the mobile menu lists Organizer for a builder");
    await context.close();
  }

  step = "member";
  for (const [label, viewport] of [["desktop", DESKTOP], ["phone", PHONE]]) {
    const { context, page } = await visitor(browser, "sess-member", viewport);
    await page.goto(new URL("/", target).href, { waitUntil: "load" });
    if (label === "phone") await page.getByRole("button", { name: "Open menu" }).click();
    await page.locator('[data-testid="nav-handle"]:visible').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(500); // let /api/me settle either way
    expect(await adminLinks(page).count() === 0, `a plain member sees no Organizer link (${label})`);
    await context.close();
  }

  step = "signed out";
  {
    const { context, page } = await visitor(browser, null, DESKTOP);
    await page.goto(new URL("/", target).href, { waitUntil: "load" });
    expect(await adminLinks(page).count() === 0, "a signed-out visitor sees no Organizer link");
    await context.close();
  }

  step = "/admin layout";
  for (const [label, viewport] of [["desktop", DESKTOP], ["phone", PHONE]]) {
    const { context, page } = await visitor(browser, "sess-steward", viewport);
    await page.goto(new URL("/admin", target).href, { waitUntil: "load" });
    await page.locator("#app:not(.hidden)").waitFor({ timeout: 15000 });
    await page.locator("#whoami").filter({ hasText: "@" }).waitFor({ timeout: 15000 });
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll <= client, `/admin has no horizontal overflow at ${viewport.width}px (${scroll} <= ${client})`);
    await page.screenshot({ path: `${shots}/admin-${label}.png`, fullPage: true });
    await context.close();
  }
} catch (err) {
  failures.push(`${step}: ${err.message}`);
  console.error(`FAIL  ${step}: ${err.message}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s) against ${host}`);
  process.exit(1);
}
console.log("\nadmin-ui e2e passed");
