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
  // /login and /admin depend on whether regenOS sign-in is switched on; the
  // expectations are appended below once /api/config says which it is.
];

const browser = await chromium.launch();
const failures = [];

// Sign-in pages: ask the deployment which mode it is in instead of accepting
// either rendering, so a blank page or the wrong mode still fails.
//   login on  (production): /login is the handle step; signed-out /admin
//     redirects to /login?returnTo=/admin and shows the sign-in panel.
//   login off (staging): /admin is the Worker's plain 503 "Sign-in isn't
//     available" page, and /login redirects there. This is the only page
//     allowed a non-2xx status.
try {
  const configRes = await fetch(new URL("/api/config", target));
  if (!configRes.ok) throw new Error(`GET /api/config returned ${configRes.status}`);
  const { regenosLoginEnabled } = await configRes.json();
  if (typeof regenosLoginEnabled !== "boolean") throw new Error("/api/config has no regenosLoginEnabled flag");
  console.log(`info  regenOS sign-in is ${regenosLoginEnabled ? "on" : "off"} (from /api/config)`);
  if (regenosLoginEnabled) {
    PAGES.push(
      { path: "/login", expect: "Choose your handle", finalPath: "/login" },
      { path: "/admin", expect: "Sign in or join COhere", finalPath: "/login" },
    );
  } else {
    PAGES.push(
      { path: "/login", expect: "Sign-in isn't available", finalPath: "/admin", status: 503 },
      { path: "/admin", expect: "Sign-in isn't available", finalPath: "/admin", status: 503 },
    );
  }
} catch (error) {
  failures.push(`/login, /admin: couldn't read /api/config to pick the expectation (${error.message})`);
}

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

for (const { path, expect, finalPath, status } of PAGES) {
  const url = new URL(path, target).toString();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    const body = await waitForRenderedBody(page, expect);
    // The final document's status: a redirect (/login -> /admin) is judged by
    // where it ended up, and only a page that names `status` may be non-2xx.
    const finalStatus = (await page.request.get(page.url()).catch(() => null))?.status() ?? response?.status();
    const wantStatus = status ?? 200;

    if (body?.includes("Something went wrong")) {
      failures.push(`${path}: error boundary rendered — the app crashed on mount`);
    } else if (!hasExpectedContent(body, expect)) {
      failures.push(`${path}: expected to find ${JSON.stringify(expect)} but the page did not render it`);
    } else if (finalStatus !== wantStatus) {
      failures.push(`${path}: expected HTTP ${wantStatus} but got ${finalStatus}`);
    } else if (finalPath && new URL(page.url()).pathname !== finalPath) {
      failures.push(`${path}: expected to end up at ${finalPath} but the browser is at ${new URL(page.url()).pathname}`);
    } else {
      console.log(`ok  ${path} (${finalStatus}) rendered`);
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
