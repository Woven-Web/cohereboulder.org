// End-to-end proof of the regenOS hosting lane, in a real browser against the
// mock AppView (scripts/regenos-mock.mjs) — sign-in panel, the magic-link
// wizard, event create/edit/delete, and the Spanish toggle.
//
// The load-bearing assertion is invisible: every step past the wizard only
// works if the browser actually STORED the `__Host-rs_session` cookie our
// Worker relayed — a proxy that mangles Set-Cookie fails here, not silently.
//
// Usage (three terminals, or backgrounded):
//   node scripts/regenos-mock.mjs
//   npx wrangler dev --port 8789 \
//     --var REGENOS_LOGIN_ENABLED:true \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9944 \
//     --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
//   node scripts/regenos-e2e.mjs http://127.0.0.1:8789

import { chromium } from "playwright";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/regenos-e2e.mjs <wrangler-dev-url>");
  process.exit(2);
}

const failures = [];
let step = "";
function ok(message) {
  console.log(`ok  ${message}`);
}
function fail(message) {
  failures.push(`${step}: ${message}`);
  console.error(`FAIL  ${step}: ${message}`);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on("pageerror", (error) => fail(`uncaught page error — ${error}`));
const eventName = `E2E Fiesta ${Date.now().toString(36)}`;

try {
  // ── 1. Anonymous calendar: the sign-in affordance renders ─────────────────
  step = "sign-in panel";
  await page.goto(new URL("/calendar", target).toString(), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign in to host events" }).click();
  // The footer's newsletter form also labels an "Email" input — target by id.
  await page.locator("#regenos-email").fill("new@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Check your email").waitFor({ timeout: 10_000 });
  ok("sign-in panel renders and beginSignup lands on the check-your-email state");

  // ── 2. The emailed link: /login?token=… walks the wizard ──────────────────
  step = "signup wizard";
  await page.goto(new URL("/login?token=tok-good", target).toString(), {
    waitUntil: "networkidle",
  });
  await page.getByText("Choose your handle").waitFor({ timeout: 10_000 });
  await page.getByLabel("Handle").fill("tester");
  await page.getByRole("button", { name: "Create my account" }).click();
  await page.getByText("You're signed in!").waitFor({ timeout: 10_000 });
  ok("verifySignup → setSignupProfile → createCustodialAccount completed");

  // ── 3. Back on the calendar, the session cookie must have stuck ───────────
  step = "session";
  await page.getByRole("link", { name: "Go to the calendar" }).click();
  await page.getByText("Signed in as").waitFor({ timeout: 10_000 });
  await page.getByText("tester.mock.test").waitFor();
  ok("browser stored the relayed __Host-rs_session cookie; getSession sees the account");

  // ── 4. Create an event ────────────────────────────────────────────────────
  step = "create event";
  await page.getByRole("button", { name: "Add an event" }).click();
  await page.getByLabel("Event name").fill(eventName);
  await page.getByLabel("Starts").fill("2026-10-16T18:00");
  await page.getByLabel("Ends").fill("2026-10-16T20:00");
  await page.getByLabel("Description").fill("Created by the e2e test.");
  await page.getByLabel("Place name").fill("Mock Hall");
  await page.getByLabel("Street address").fill("100 Mock St");
  await page.getByRole("button", { name: "Create event" }).click();
  await page.getByText(eventName).waitFor({ timeout: 10_000 });
  ok("createEvent landed under the collective and the calendar refetched it");

  // ── 5. Edit it ────────────────────────────────────────────────────────────
  step = "edit event";
  const card = page.locator("div").filter({ has: page.getByText(eventName) });
  await page.getByRole("button", { name: "Edit", exact: true }).last().click();
  await page.getByLabel("Event name").waitFor();
  await page.getByLabel("Event name").fill(`${eventName} (edited)`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(`${eventName} (edited)`).waitFor({ timeout: 10_000 });
  ok("updateEvent round-tripped (prefill + rename visible)");
  void card;

  // ── 6. Cancel (delete) it ─────────────────────────────────────────────────
  step = "delete event";
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel event" }).last().click();
  await page
    .getByText(`${eventName} (edited)`)
    .waitFor({ state: "detached", timeout: 10_000 });
  ok("deleteEvent removed it from the calendar");

  // ── 7. Spanish ────────────────────────────────────────────────────────────
  step = "spanish";
  await page.getByRole("button", { name: "En/Es" }).first().click();
  await page.getByText("Sesión iniciada como").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Añadir un evento" }).waitFor();
  ok("ES toggle: hosting strings render in Spanish");

  // ── 8. Sign out ───────────────────────────────────────────────────────────
  step = "sign out";
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await page.getByRole("button", { name: "Inicia sesión para organizar eventos" }).waitFor({
    timeout: 10_000,
  });
  ok("logout cleared the session; the panel is back");
} catch (error) {
  fail(error.message.split("\n")[0]);
} finally {
  await browser.close();
}

if (failures.length) {
  process.exit(1);
}
console.log("regenOS e2e passed.");
