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
  // Renders whichever calendar source is live (regenOS cards or the Luma
  // fallback); the header proves the page itself mounted either way.
  { path: "/calendar", expect: "Community Calendar" },
  // Accountless propose flow — always reachable, no session needed.
  { path: "/propose", expect: "Propose an event" },
  // The magic-link landing page. REGENOS_LOGIN_ENABLED is off in production
  // today (see CLAUDE.md), so a no-token visit never reaches the wizard.
  // What it does instead is a runtime behavior, not tied to one commit — it
  // changed mid-development of this very PR (main's PR #25, "Give a
  // no-token /login visit somewhere to go", redirects to /admin instead of
  // the older standalone "invalid link" card). Either is real content
  // proving the page mounted rather than crashed, so accept both.
  { path: "/login", expect: ["That link didn't work", "Sign in with your email"] },
  // The admin portal is a self-contained HTML page the Worker serves
  // directly (worker/src/admin-page.ts) — not part of the React SPA, so a
  // 200 here is closer to proof than elsewhere, but still worth checking the
  // sign-in card actually rendered rather than a blank or broken page.
  { path: "/admin", expect: "Sign in with your email" },
];

const browser = await chromium.launch();
const failures = [];

/** True once any of the acceptable strings (one or several) appears in body. */
function hasExpectedContent(body, expect) {
  const candidates = Array.isArray(expect) ? expect : [expect];
  return candidates.some((text) => body?.includes(text));
}

/**
 * `networkidle` only proves the network went quiet — a page whose content
 * depends on a react-query effect (e.g. /login's config-gated redirect) can
 * still be mid-render a moment later. Poll body text for a few seconds
 * rather than reading it exactly once.
 */
async function waitForRenderedBody(page, expect, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let body = await page.textContent("body");
  while (Date.now() < deadline && !body?.includes("Something went wrong") && !hasExpectedContent(body, expect)) {
    await page.waitForTimeout(250);
    body = await page.textContent("body");
  }
  return body;
}

// One event detail page, built from whatever the public feed actually has.
// Skips gracefully — this isn't a failure, just nothing to check today.
try {
  const eventsUrl = new URL("/api/events", target).toString();
  const eventsRes = await fetch(eventsUrl);
  if (!eventsRes.ok) {
    console.log(`skip  event detail page — GET /api/events returned ${eventsRes.status}`);
  } else {
    const body = await eventsRes.json();
    const first = body?.events?.[0];
    if (!first?.did || !first?.rkey) {
      console.log("skip  event detail page — /api/events returned no events");
    } else {
      PAGES.push({
        path: `/events/${first.did}/${first.rkey}`,
        expect: first.name,
      });
    }
  }
} catch (error) {
  console.log(`skip  event detail page — couldn't fetch /api/events (${error.message})`);
}

for (const { path, expect } of PAGES) {
  const url = new URL(path, target).toString();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    const body = await waitForRenderedBody(page, expect);

    if (body?.includes("Something went wrong")) {
      failures.push(`${path}: error boundary rendered — the app crashed on mount`);
    } else if (!hasExpectedContent(body, expect)) {
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
