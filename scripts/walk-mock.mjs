// Walks the signed-in flows on the local regenOS mock like a member would, at four sizes in English and
// Spanish, screenshotting every screen and step: sign-in dialog, register/edit, Board (and a post),
// People, Me and notifications, an RSVP on a future event, and a harvest shared, edited and deleted
// through the ⋯ menu on an event that has ended. Lists the layout faults a script can see.
// Run by scripts/calendar-desktop-e2e.sh (WALKMOCK=1); nothing leaves this machine.
//
//   node scripts/walk-mock.mjs <wrangler-dev-url> <regenos-mock-url> <shots-dir>
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { seedEvents } from "./calendar-desktop-seed.mjs";

const [base, mock, shots] = process.argv.slice(2);
if (!base || !mock || !shots) { console.error("usage: node scripts/walk-mock.mjs <worker-url> <mock-url> <shots-dir>"); process.exit(2); }
await mkdir(shots, { recursive: true });
await seedEvents(mock);
const browser = await chromium.launch();
const NOON = "2026-10-16T18:00:00Z";
const problems = [];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC", "base64");
const DID = "did:plc:mockscene";
const SIZES = [[1280, 800], [1440, 900], [1024, 768], [390, 844]];

const findings = (page) => page.evaluate(() => {
  const out = [];
  const sx = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (sx > 0) out.push(`page scrolls sideways by ${sx}px`);
  const name = (e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)} "${(e.textContent || "").trim().slice(0, 24)}"`;
  const vw = document.documentElement.clientWidth;
  for (const el of document.querySelectorAll("main *, header *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.display === "contents" || cs.visibility === "hidden") continue;
    if (el.closest(".homelive, .next, [role=switch], .switch, [role=checkbox], .peer, button[role=checkbox], .trail__days, .trail__day, .trail--pick, [role=listbox], .chips, .board__side")) continue;
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === "visible" && el.clientWidth > 0) out.push(`text wider than its box: ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    const r = el.getBoundingClientRect();
    if (r.width && r.right > vw + 1) out.push(`past the right edge: ${name(el)}`);
  }
  return [...new Set(out)].slice(0, 8);
});

for (const [w, h] of SIZES) for (const lang of ["en", "es"]) {
  const tag = `${lang}-${w}`;
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  await context.clock.setFixedTime(new Date(NOON));
  // Production defaults to the ecology look; a local server defaults to classic, so ask for what visitors see.
  await context.addInitScript(() => { try { localStorage.setItem("cohere-look", "ecology"); } catch { /* an opaque-origin frame */ } });
  await context.route("https://www.youtube.com/**", (r) => r.fulfill({ contentType: "text/html", body: "" }));
  const errors = [];
  const open = async (path, then) => {
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`page error ${e}`));
    await page.goto(`${base}${path}`, { waitUntil: "load" });
    await page.locator("h1, h2").first().waitFor({ timeout: 8000 }).catch(() => {});
    if (lang === "es") await page.getByRole("button", { name: "Español", exact: true }).first().click({ timeout: 3000 }).catch(() => errors.push("no language toggle"));
    if (then) await then(page);
    return page;
  };
  const snap = async (page, name, full = true) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}/${name}-${tag}.png`, fullPage: full });
    for (const f of await findings(page)) problems.push(`${name} ${tag}: ${f}`);
  };
  const run = async (name, fn) => { try { await fn(); } catch (e) { problems.push(`${name} ${tag}: step failed: ${String(e).split("\n")[0].slice(0, 140)}`); } };

  // Signed out: the sign-in dialog and its "check your email" step (the mock sends no mail).
  await run("signin", async () => {
    const page = await open("/calendar");
    // The masthead hides Sign in on a phone; the foot carries it there.
    await page.getByRole("button", { name: /^(Sign in|Iniciar sesión|Entrar)/i }).locator("visible=true").first().click();
    // A dialog from the masthead on a laptop; on a phone the Calendar page opens its own sign-in card.
    await page.locator("#regenos-email-dialog, #regenos-email").first().waitFor({ timeout: 5000 });
    await snap(page, "signin-dialog", false);
    await page.locator("#regenos-email-dialog, #regenos-email").first().fill("walker@example.test");
    await page.locator("form:has(#regenos-email-dialog, #regenos-email) button[type=submit]").click();
    await page.waitForTimeout(900);
    await snap(page, "signin-checkemail", false);
    await page.close();
  });
  // The foot's Sign in (the only one on a phone's masthead-less pages) opens the same dialog.
  if (w < 768) await run("signin-foot", async () => {
    const page = await open("/about");
    await page.locator(".foot__account button, .foot__account a").first().click();
    await page.locator("#regenos-email-dialog").waitFor({ timeout: 5000 });
    await snap(page, "signin-foot-dialog", false);
    await page.close();
  });

  // Sign in as the mock's member (the cookie a finished sign-in would leave).
  await context.addCookies([{ name: "__Host-rs_session", value: "mock-peer", domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  for (const [name, path, wait] of [
    ["home", "/", 600], ["today", "/today", 600], ["calendar-week", "/calendar", 600], ["calendar-day", "/calendar?day=2026-10-17", 400],
    ["calendar-past-day", "/calendar?day=2026-10-15", 400], ["register", "/register", 1200], ["people", "/people", 900], ["profile", "/profile", 900],
    ["me", "/more", 400], ["notifications", "/more/notifications", 900], ["propose", "/propose", 400],
  ]) await run(name, async () => { const page = await open(path); await page.waitForTimeout(wait); await snap(page, `s-${name}`); await page.close(); });

  await run("board", async () => {
    const page = await open("/board"); await page.waitForTimeout(900);
    await snap(page, "board");
    if (lang === "en" && w === 1280) {
      await page.getByRole("button", { name: /write a post/i }).first().click();
      await page.waitForTimeout(500);
      await page.locator("textarea").first().fill("Two seats open to the Saturday work day; leaving at 8:15.");
      await snap(page, "board-compose", false);
    }
    await page.close();
  });

  await run("event-future-rsvp", async () => {
    const page = await open(`/events/${DID}/cd-market`); await page.waitForTimeout(900);
    await snap(page, "event-future");
    const rsvp = page.getByRole("button", { name: /^(RSVP|Confirmar)/i }).first();
    if (await rsvp.count()) { await rsvp.click().catch(() => {}); await page.waitForTimeout(900); await snap(page, "event-future-after-rsvp"); }
    await page.close();
  });

  await run("harvest", async () => {
    const page = await open(`/events/${DID}/cd-opening`);
    await page.getByTestId("harvest-composer").waitFor({ timeout: 10000 });
    await snap(page, "event-past");
    await page.locator("#hv-t").fill("We stood by the creek and named what we were grateful for. I want to know where it begins.");
    await page.getByTestId("harvest-photo-input").setInputFiles({ name: "pond.png", mimeType: "image/png", buffer: PNG });
    await page.locator(".compose .ph img").waitFor({ timeout: 8000 }).catch(() => {});
    await snap(page, "harvest-composer-filled", false);
    await page.getByTestId("harvest-share").click();
    await page.getByTestId("harvest-mine").waitFor({ timeout: 12000 });
    await snap(page, "harvest-shared");
    await page.getByTestId("harvest-menu").click();
    await page.getByRole("menu").waitFor();
    await snap(page, "harvest-menu", false);
    await page.getByTestId("harvest-menu-edit").click();
    await page.getByTestId("harvest-editor").waitFor();
    await page.locator("#hv-t").fill("We stood by the creek and named what we were grateful for.");
    await snap(page, "harvest-edit", false);
    await page.getByTestId("harvest-save").click();
    await page.getByTestId("harvest-edited").waitFor({ timeout: 8000 }).catch(() => {});
    await snap(page, "harvest-edited");
    await page.getByTestId("harvest-menu").click();
    await page.getByTestId("harvest-menu-delete").click();
    await page.getByRole("dialog").waitFor();
    await snap(page, "harvest-delete-confirm", false);
    await page.getByTestId("harvest-delete-yes").click().catch(() => {});
    await page.waitForTimeout(900);
    await snap(page, "harvest-deleted");
    await page.close();
  });
  for (const e of errors) problems.push(`${tag}: ${e}`);
  await context.close();
}
await browser.close();
console.log(problems.length ? `walk-mock: ${problems.length} finding(s):\n${problems.map((p) => `  - ${p}`).join("\n")}` : "walk-mock: no findings");
