// End-to-end proof of the regenOS hosting lane, in a real browser against the
// mock AppView (scripts/regenos-mock.mjs) — sign-in panel, the magic-link
// wizard, the proxy's cookie isolation, event create/edit/delete, and the
// Spanish toggle.
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
  const metadata = await context.request.get(new URL("/oauth-client-metadata.json", target).href);
  if (metadata.status() !== 404) throw new Error("Unimplemented OAuth metadata must return 404");
  for (const nsid of ["beginOAuth", "oauthCallback", "respondToRequest"]) {
    const response = await context.request.get(new URL(`/xrpc/social.scenius.${nsid}`, target).href);
    if (response.status() !== 404) throw new Error(`Unused ${nsid} must return 404`);
  }
  ok("unfinished OAuth endpoints and other unused methods are not advertised or proxied");
  // ── 1. Anonymous calendar: the sign-in affordance renders ─────────────────
  step = "sign-in panel";
  await page.goto(new URL("/calendar", target).toString(), { waitUntil: "networkidle" });
  const headerLinks = await page.locator("nav").first().getByRole("link").allTextContents();
  if (!headerLinks[1]?.includes("Calendar")) fail(`Calendar is not the first nav destination: ${headerLinks.join(" | ")}`);
  if (headerLinks.some((text) => text === "About")) fail("About still occupies the primary navigation");
  await page.locator("footer").getByRole("link", { name: "About" }).waitFor();
  ok("Calendar is first in the nav, About lives in the footer");
  // A week out, the home hero's only call to action is Register; the
  // email-only subscribe lives in the footer.
  await page.goto(new URL("/", target).toString(), { waitUntil: "networkidle" });
  const heroRegister = page.getByRole("link", { name: "Register for COhere 2026" }).first();
  await heroRegister.waitFor();
  const hero = page.locator("section", { has: heroRegister }).first();
  const heroEmail = await hero.locator("input[type=email]").count();
  const footerEmail = await page.locator("footer input[type=email]").count();
  if (heroEmail !== 0 || footerEmail !== 1) fail(`home email fields: hero=${heroEmail} footer=${footerEmail}`);
  ok("home hero is register-only; the footer keeps the email subscribe");
  await page.goto(new URL("/calendar", target).toString(), { waitUntil: "networkidle" });
  // The nav's Sign in opens the same regenOS sign-in in a dialog.
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByRole("dialog").getByText("Sign in to COhere").waitFor({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  ok("nav Sign in opens the sign-in dialog");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
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
  await page.getByText("tester.mock.test").first().waitFor();
  // The nav's account control shows the same handle once signed in.
  const navHandle = (await page.getByTestId("nav-handle").first().textContent())?.trim();
  if (navHandle !== "tester.mock.test") fail(`nav account control shows ${navHandle ?? "(nothing)"}`);
  else ok("nav shows the signed-in handle");
  ok("browser stored the relayed __Host-rs_session cookie; getSession sees the account");

  // ── 3b. The cookie filter, both directions ───────────────────────────────
  // The proxy shares an origin with the admin portal, whose `cohere_session`
  // is Path=/ and therefore rides every /xrpc call. It must not cross to the
  // AppView, and the AppView must not be able to set it coming back.
  step = "cookie isolation";
  await context.addCookies([
    { name: "cohere_session", value: "decoy-admin-session", url: target },
  ]);
  // The probe runs INSIDE the page, not through context.request — only the
  // browser sends `__Host-` cookies, and same-origin fetch exposes every
  // response header, so the echo is readable.
  const sawCookie = await page.evaluate(async () => {
    const res = await fetch("/xrpc/social.scenius.getSession", { cache: "no-store" });
    return res.headers.get("x-mock-saw-cookie") ?? "(missing)";
  });
  if (!sawCookie.includes("__Host-rs_session")) {
    fail(`upstream never saw the regenOS session cookie (saw: ${sawCookie})`);
  } else if (sawCookie.includes("cohere_session")) {
    fail(`the site's own admin session leaked upstream (saw: ${sawCookie})`);
  } else {
    ok("upstream saw only regenOS's own cookies, not the site's admin session");
  }
  const jar = await context.cookies(target);
  const planted = jar.find((c) => c.name === "cohere_session");
  if (planted?.value !== "decoy-admin-session") {
    fail(
      `upstream tampered with the site's own cohere_session through the proxy (now: ${
        planted ? planted.value : "gone"
      })`,
    );
  } else {
    ok("upstream's hostile Set-Cookie was dropped; the site's own cookie survives");
  }
  await context.clearCookies({ name: "cohere_session" });

  // ── 3c. RSVP as the signed-in user, on regenOS through the proxy ─────────
  step = "signed-in rsvp";
  await page.goto(new URL("/events/did:plc:mockscene/ev-seed1", target).toString(), { waitUntil: "networkidle" });
  const rsvpPanel = page.getByTestId("event-rsvp");
  await rsvpPanel.getByRole("button", { name: "RSVP", exact: true }).click();
  await rsvpPanel.getByTestId("rsvp-state").getByText("Going", { exact: true }).waitFor({ timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await rsvpPanel.getByTestId("rsvp-state").waitFor({ timeout: 10_000 });
  ok("rsvp going → getEventAttendance.mySeat reads back 'You're going' after a reload");
  await rsvpPanel.getByRole("button", { name: "Cancel my RSVP" }).click();
  await rsvpPanel.getByRole("button", { name: "RSVP", exact: true }).waitFor({ timeout: 10_000 });
  if (await rsvpPanel.getByTestId("rsvp-form").count()) fail("signed-in visitor was shown the email form");
  ok("notgoing withdraws; no email form for a signed-in visitor");
  await page.goto(new URL("/calendar", target).toString(), { waitUntil: "networkidle" });

  // ── 3d. One-click RSVP from a calendar card when signed in ───────────────
  step = "one-click card rsvp";
  const seedCard = page.getByTestId("event-card").filter({ hasText: "Seed Gathering" }).first();
  // Slow the write so a second click lands while the first is in flight: it
  // must neither navigate (fall through to the card link) nor RSVP twice.
  let rsvpWrites = 0;
  let releaseWrite;
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  await page.route("**/xrpc/social.scenius.rsvp", async (route) => {
    rsvpWrites += 1;
    await writeGate;
    await route.continue();
  });
  const cardButton = seedCard.getByTestId("card-rsvp");
  await page.setViewportSize({ width: 390, height: 844 });
  if ((await cardButton.boundingBox()).height < 44) fail("card RSVP is shorter than 44px");
  for (const label of ["RSVP", "Confirmar"]) {
    await cardButton.getByText(label, { exact: true }).waitFor();
    const addButton = seedCard.getByRole("button", { name: /^(Add to calendar|Añadir al calendario)$/ });
    const [rsvpBox, addBox] = await Promise.all([cardButton.boundingBox(), addButton.boundingBox()]);
    if (rsvpBox.height < 44 || addBox.height < 44 || Math.abs(rsvpBox.y - addBox.y) > 1) fail(`mobile action sizing/row failed for ${label}`);
    if (await addButton.evaluate((el) => getComputedStyle(el).whiteSpace !== "nowrap" || el.scrollWidth > el.clientWidth)) fail("calendar label wraps or overflows");
    await page.getByRole("button", { name: label === "RSVP" ? "En/Es" : "Es/En" }).filter({ visible: true }).click();
  }
  const preview = seedCard.getByTestId("card-description");
  const clamped = await preview.evaluate((el) => ({
    clamp: getComputedStyle(el).webkitLineClamp,
    children: el.children.length,
    text: el.textContent,
  }));
  if (clamped.clamp !== "3" || clamped.children !== 0 || /[\r\n]|^…$/.test(clamped.text.trim())) fail("description is not one clamped text block");
  if ((await seedCard.getByRole("link", { name: "Seed Gathering", exact: true }).boundingBox()).height < 44) fail("card title tap target is shorter than 44px");
  // Let the attendance query become stale, then refetch it while the write
  // is held. A changed seat must never clear the independent write lock.
  await page.waitForTimeout(31_000);
  await cardButton.click();
  // Prove the second click lands WHILE busy: wait for the spinner, then
  // force it (a normal click would wait for the button to free up).
  await cardButton.locator(".animate-spin").waitFor({ timeout: 5_000 });
  for (let tries = 0; rsvpWrites === 0 && tries < 250; tries++) await page.waitForTimeout(20);
  if (rsvpWrites !== 1) throw new Error("first card write never reached the held route");
  let attendanceRefetched = false;
  await page.route("**/xrpc/social.scenius.getEventAttendance?**", async (route) => {
    attendanceRefetched = true;
    await route.fulfill({ json: { mySeat: "confirmed", attendance: "open" } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await cardButton.getByText("Going", { exact: true }).waitFor({ timeout: 5_000 });
  if (!attendanceRefetched) fail("attendance did not refetch during the held write");
  await cardButton.click({ force: true });
  await page.waitForTimeout(300);
  if (rsvpWrites !== 1) fail(`mid-write attendance refetch allowed ${rsvpWrites} writes (including an unintended cancel)`);
  releaseWrite();
  await page.unroute("**/xrpc/social.scenius.getEventAttendance?**");
  if (!new URL(page.url()).pathname.startsWith("/calendar")) fail(`a busy click navigated to ${page.url()}`);
  await cardButton.getByText("Going", { exact: true }).waitFor({ timeout: 10_000 });
  await cardButton.locator(".animate-spin").waitFor({ state: "detached" });
  await page.unroute("**/xrpc/social.scenius.rsvp");
  if (rsvpWrites !== 1) fail(`card RSVP wrote ${rsvpWrites} times for two quick clicks`);
  if (!new URL(page.url()).pathname.startsWith("/calendar")) fail(`card RSVP navigated away to ${page.url()}`);
  await page.goto(new URL("/events/did:plc:mockscene/ev-seed1", target).toString(), { waitUntil: "networkidle" });
  await rsvpPanel.getByTestId("rsvp-state").getByText("Going", { exact: true }).waitFor({ timeout: 10_000 });
  const banner = page.getByTestId("event-banner");
  const untinted = await banner.evaluate((img) =>
    img.parentElement.children.length === 1 && getComputedStyle(img).filter === "none" && getComputedStyle(img).mixBlendMode === "normal");
  if (!untinted) fail("banner has an overlay sibling or image filter/blend");
  ok("a signed-in card click RSVPs in place, and the detail page agrees");
  await rsvpPanel.getByRole("button", { name: "Cancel my RSVP" }).click();
  await rsvpPanel.getByRole("button", { name: "RSVP", exact: true }).waitFor({ timeout: 10_000 });
  await page.goto(new URL("/calendar", target).toString(), { waitUntil: "networkidle" });

  await page.getByTestId("card-rsvp").first().click();
  await page.getByTestId("card-rsvp").first().getByText("Going", { exact: true }).waitFor();
  await page.getByTestId("card-rsvp").first().click();
  await page.getByTestId("card-rsvp").first().getByText("RSVP", { exact: true }).waitFor();
  ok("a second card click withdraws the RSVP");
  await page.setViewportSize({ width: 1280, height: 800 });

  // A signed-in member is not a collective builder: direct event controls
  // must not be offered. The public proposal form stays available.
  step = "ordinary member sees proposal, not direct management";
  await context.addCookies([{
    name: "__Host-rs_session", value: "mock-member", domain: "127.0.0.1", path: "/",
    secure: true, httpOnly: true, sameSite: "Lax",
  }]);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Hosting something during COhere? Propose it for the calendar.", { exact: true }).waitFor();
  if (await page.getByText(/You don.t need an account/).count()) fail("signed-in member sees accountless copy");
  await page.getByRole("link", { name: "Propose an event" }).first().waitFor();
  if (await page.getByRole("button", { name: "Add an event" }).count()) fail("member was offered direct event creation");
  if (await page.getByRole("button", { name: "Edit", exact: true }).count()) fail("member was offered event editing");
  await page.getByRole("button", { name: "En/Es" }).filter({ visible: true }).click();
  await page.getByText("¿Organizas algo durante COhere? Proponlo para el calendario.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Es/En" }).filter({ visible: true }).click();
  ok("ordinary member sees bilingual proposal callout, not Add/Edit/Cancel event");
  // Hidden controls are courtesy; a direct write must still be refused.
  const memberWrite = await page.evaluate(async () => {
    const res = await fetch("/xrpc/social.scenius.createEvent", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ authority: "did:plc:mockscene", rkey: "member-try", name: "Member try", startsAt: "2030-01-01T18:00:00Z" }),
    });
    return res.status;
  });
  if (memberWrite !== 403) fail(`member direct createEvent answered ${memberWrite}, expected 403`);
  await page.getByRole("link", { name: "Propose an event" }).first().click();
  await page.waitForURL(/\/propose$/);
  await page.getByRole("heading").first().waitFor();
  ok("member direct write is refused (403) and the proposal page loads");
  await page.goto(new URL("/calendar", target).toString(), { waitUntil: "networkidle" });
  await context.addCookies([{
    name: "__Host-rs_session", value: "sess-1", domain: "127.0.0.1", path: "/",
    secure: true, httpOnly: true, sameSite: "Lax",
  }]);
  await page.reload({ waitUntil: "networkidle" });

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
  await page.getByRole("button", { name: "Inicia sesión", exact: true }).waitFor({
    timeout: 10_000,
  });
  ok("logout cleared the session; the panel is back");

  step = "returning-user redirect";
  await page.goto(new URL("/xrpc/social.scenius.verifyEmail?token=tok-return", target).href);
  if (page.url() !== new URL("/", target).href) throw new Error("Returning user did not land on this origin");
  await page.goto(new URL("/calendar", target).href, { waitUntil: "networkidle" });
  await page.getByText("Signed in as").waitFor({ timeout: 10_000 });
  ok("returning-user redirect stays local and installs the session cookie");
} catch (error) {
  fail(error.message.split("\n")[0]);
} finally {
  await browser.close();
}

if (failures.length) {
  process.exit(1);
}
console.log("regenOS e2e passed.");
