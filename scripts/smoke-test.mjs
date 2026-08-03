// Load the deployed site in a real browser and prove it actually rendered.
//
// A curl-based check cannot do this. The app renders client-side, so the
// served HTML is byte-identical whether the app mounts or throws — which is
// exactly how a ReferenceError kept the site behind the error boundary for two
// days while every deploy reported success.
//
// Usage: node scripts/smoke-test.mjs https://cohereboulder.org

import { chromium } from "playwright";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/smoke-test.mjs <url>");
  process.exit(2);
}

// Paths worth proving, and a string that must appear once each has rendered.
const PAGES = [
  { path: "/", expect: "Weaving Our Resilience" },
  { path: "/register", expect: "Register" },
];

const browser = await chromium.launch();
const failures = [];

for (const { path, expect } of PAGES) {
  const url = new URL(path, target).toString();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    const body = await page.textContent("body");

    if (body?.includes("Something went wrong")) {
      failures.push(`${path}: error boundary rendered — the app crashed on mount`);
    } else if (!body?.includes(expect)) {
      failures.push(`${path}: expected to find ${JSON.stringify(expect)} but the page did not render it`);
    } else {
      console.log(`ok  ${path} (${response?.status()}) rendered`);
    }

    if (consoleErrors.length) {
      failures.push(`${path}: uncaught error — ${consoleErrors[0]}`);
    }
  } catch (error) {
    failures.push(`${path}: ${error.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();

if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exit(1);
}
console.log("Smoke test passed.");
