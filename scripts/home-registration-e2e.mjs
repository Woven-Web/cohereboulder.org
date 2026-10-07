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
    // Keep the home page check hermetic: embedded films are not under test.
    await context.route("https://www.youtube.com/**", r => r.fulfill({ contentType: "text/html", body: "" }));
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
          for (const badge of await page.locator('[role="status"]').all()) {
            const result = await badge.evaluate(el => {
              const style = getComputedStyle(el);
              const luminance = color => {
                const c = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
                  v /= 255;
                  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
                });
                return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
              };
              const a = luminance(style.color), b = luminance(style.backgroundColor);
              return { contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
                border: style.borderWidth, tabIndex: el.tabIndex, check: Boolean(el.querySelector('svg')) };
            });
            assert.ok(result.contrast >= 4.5, `Status contrast: ${result.contrast}`);
            assert.equal(result.border, '0px');
            assert.equal(result.tabIndex, -1);
            assert.ok(result.check);
          }
        } else {
          assert.ok(await page.locator('main a[href="/register"]').count());
        }
        if (shots && registered !== null) await page.screenshot({ path: `${shots}/home-${width}-${language}-${registered ? "registered" : "unregistered"}.png` });
        await page.goto(`${target}/events`, { waitUntil: "networkidle" });
        if (language === "es") await page.getByRole("button", { name: "En/Es", exact: true }).click();
        if (registered) {
          assert.equal(await page.locator('a[href="/register"]').count(), 0);
          assert.equal(await page.locator('main [role="status"]').count(), 0);
        }
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
