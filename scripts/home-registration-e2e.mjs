// Browser coverage uses synthetic sessions and private status responses; no auth or regenOS writes.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const target = process.argv[2];
const shots = process.env.SLICE2B_SHOTS;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch();
try {
  for (const registered of [true, false, null]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("**/xrpc/social.scenius.getSession", r => r.fulfill({ json: { did: "did:plc:fixture", handle: "fixture.scenius.social" } }));
    await page.route("**/api/me/registration", r => r.fulfill({ json: { registered } }));
    for (const language of ["en", "es"]) {
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${target}/`, { waitUntil: "networkidle" });
        if (language === "es" && await page.getByRole("button", { name: "En/Es", exact: true }).count()) await page.getByRole("button", { name: "En/Es", exact: true }).click();
        assert.equal(new URL(page.url()).pathname, "/");
        if (registered) {
          await page.locator('main [role="status"]').first().waitFor();
          assert.equal(await page.locator('a[href="/register"]').count(), 0);
        } else {
          assert.ok(await page.locator('main a[href="/register"]').count());
        }
        if (shots && registered !== null) await page.screenshot({ path: `${shots}/home-${width}-${language}-${registered ? "registered" : "unregistered"}.png` });
        await page.goto(`${target}/events`, { waitUntil: "networkidle" });
        if (language === "es") await page.getByRole("button", { name: "En/Es", exact: true }).click();
        if (registered) assert.equal(await page.locator('a[href="/register"]').count(), 0);
        else assert.ok(await page.locator('a[href="/register"]').count());
        if (shots && registered !== null) await page.screenshot({ fullPage: true, path: `${shots}/events-${width}-${language}-${registered ? "registered" : "unregistered"}.png` });
        await page.getByRole("link", { name: "[CO]here", exact: true }).click();
        await page.waitForURL(`${target}/`);
        if (width === 390) await page.getByRole("button", { name: /Open menu|Abrir menú/ }).click();
        await page.locator('nav a[href="/"]:visible').filter({ hasText: /Home|Inicio/ }).click();
        await page.waitForURL(`${target}/`);
      }
    }
    await page.goto(`${target}/?signedIn=1`, { waitUntil: "networkidle" });
    await page.waitForURL(`${target}/events`);
    await page.evaluate(() => localStorage.setItem("cohere:returnTo", "/register"));
    await page.goto(`${target}/?signedIn=1`, { waitUntil: "networkidle" });
    await page.waitForURL(`${target}${registered ? "/events" : "/register"}`);
    await context.close();
  }
  console.log("Home, email-link landing, registration states, and home navigation passed.");
} finally { await browser.close(); }
