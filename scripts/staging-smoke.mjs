// Read-only browser checks; never submits forms or sends email.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const base = process.argv[2];
assert.ok(base, "usage: node scripts/staging-smoke.mjs <url>");
const browser = await chromium.launch();
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const [path, text] of [["/", "Weaving Our Resilience"], ["/events", "Community Calendar"], ["/register", "Register"], ["/board", "The COhere Board opens soon"]]) {
      const response = await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor();
      if (path === "/register") await page.locator('input[type="email"]').first().waitFor();
      assert.equal(await page.getByText("Something went wrong").count(), 0);
      assert.deepEqual(errors, [], `${width} ${path}: page errors`);
      console.log(`ok ${width} ${path}: rendered, 0 page errors`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
