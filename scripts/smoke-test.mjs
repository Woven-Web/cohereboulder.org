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
  // The magic-link landing page. With REGENOS_LOGIN_ENABLED on (production
  // since 2026-09-28) a no-token visit shows the handle step; with it off it
  // redirects to the organizer sign-in. Either proves the page mounted.
  { path: "/login", expect: ["Choose your handle", "Sign in with your email"] },
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
  // A page mid-navigation (e.g. /login replacing itself with /admin) has no
  // execution context for a moment; reading the body then throws. Treat that
  // read as "nothing yet" and keep polling instead of failing the page.
  const readBody = async () => {
    try {
      return await page.textContent("body");
    } catch {
      return null;
    }
  };
  let body = await readBody();
  while (Date.now() < deadline && !body?.includes("Something went wrong") && !hasExpectedContent(body, expect)) {
    await page.waitForTimeout(250);
    body = await readBody();
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

for (const { path, expect, finalPath } of PAGES) {
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
    } else if (finalPath && new URL(page.url()).pathname !== finalPath) {
      failures.push(`${path}: expected to end up at ${finalPath} but the browser is at ${new URL(page.url()).pathname}`);
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
