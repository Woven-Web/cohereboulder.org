// Walks the app on a laptop and takes a screenshot of every screen, and reports the layout faults a
// script can see (sideways scroll, a box whose text is wider than it is). The screenshots are for a
// person to look at; this only lists what is mechanically wrong.
// Run by scripts/calendar-desktop-e2e.sh <shots-dir>, against the local Worker + regenOS mock.
//
//   node scripts/desktop-walk.mjs <wrangler-dev-url> <regenos-mock-url> <shots-dir>
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { seedEvents } from "./calendar-desktop-seed.mjs";

const [base, mock, shots] = process.argv.slice(2);
if (!base || !mock || !shots) { console.error("usage: node scripts/desktop-walk.mjs <worker-url> <mock-url> <shots-dir>"); process.exit(2); }
await mkdir(shots, { recursive: true });
await seedEvents(mock);
const browser = await chromium.launch();
const NOON = "2026-10-16T18:00:00Z";
const problems = [];

const SIZES = [[1280, 800], [1440, 900], [390, 844]];
const SCREENS = [
  // [name, path, signed in as, then-run]
  ["home", "/"],
  ["today", "/today"],
  ["calendar-week", "/calendar", null, async (p, w) => { if (w >= 1024) await p.getByTestId("calendar-week").waitFor({ timeout: 8000 }).catch(() => {}); }],
  ["calendar-day", "/calendar?day=2026-10-17"],
  ["calendar-past-day", "/calendar?day=2026-10-15"],
  ["register", "/register", null, (p) => p.locator("#field-full_name").waitFor()],
  ["signin", "/login"],
  ["board-signedout", "/board"],
  ["board", "/board", "mock-peer", (p) => p.waitForTimeout(800)],
  ["people", "/people", "mock-peer", (p) => p.waitForTimeout(800)],
  ["me", "/more", "mock-peer"],
  ["notifications", "/more/notifications", "mock-peer", (p) => p.waitForTimeout(800)],
  ["profile-edit", "/profile", "mock-peer", (p) => p.waitForTimeout(800)],
  ["propose", "/propose"],
];

const findings = (page) => page.evaluate(() => {
  const out = [];
  const sx = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (sx > 0) out.push(`page scrolls sideways by ${sx}px`);
  const name = (e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)} "${(e.textContent || "").trim().slice(0, 24)}"`;
  const vw = document.documentElement.clientWidth;
  for (const el of document.querySelectorAll("main *, header *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "inline" || cs.display === "contents" || cs.visibility === "hidden") continue;
    if (el.closest("[role=switch], .switch, [role=checkbox], .peer, .trail__days, .trail__day") ) continue;
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX === "visible" && el.clientWidth > 0) out.push(`text wider than its box: ${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    // The day picker scrolls sideways on a phone, and switches/checkboxes draw their own knob: neither is a fault.
    if (el.closest(".trail--pick, [role=listbox], [role=switch], .switch, [role=checkbox], .peer")) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.right > vw + 1) out.push(`past the right edge: ${name(el)}`);
  }
  return [...new Set(out)].slice(0, 8);
});

for (const [w, h] of SIZES) {
  const guests = new Map();
  async function ctx(member) {
    if (guests.has(member ?? "")) return guests.get(member ?? "");
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    await context.clock.setFixedTime(new Date(NOON));
    await context.route("https://www.youtube.com/**", (r) => r.fulfill({ contentType: "text/html", body: "" }));
    if (member) await context.addCookies([{ name: "__Host-rs_session", value: member, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
    guests.set(member ?? "", context);
    return context;
  }
  for (const [name, path, member = null, then] of SCREENS) {
    const page = await (await ctx(member)).newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${base}${path}${path.includes("?") ? "&" : "?"}look=ecology`, { waitUntil: "load" });
    await page.locator("h1, h2").first().waitFor({ timeout: 8000 }).catch(() => {});
    if (then) await then(page, w);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}/${name}-${w}.png`, fullPage: true });
    for (const f of await findings(page)) problems.push(`${name} @${w}: ${f}`);
    for (const e of errors) problems.push(`${name} @${w}: page error ${e}`);
    await page.close();
  }
  // The sign-in dialog, and a day clicked in the trail (the right-hand panel should follow it).
  if (w >= 1024) {
    const page = await (await ctx(null)).newPage();
    await page.goto(`${base}/calendar?look=ecology`, { waitUntil: "load" });
    await page.getByRole("button", { name: "Sign in" }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shots}/signin-dialog-${w}.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("option", { name: /^\w+day Oct 17/ }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${shots}/calendar-after-click-${w}.png`, fullPage: true });
    await page.close();
  }
  // Events: a future one, and yesterday's with its harvest composer (a member who RSVP'd).
  const member = await ctx("mock-peer");
  const page = await member.newPage();
  await page.goto(`${base}/about`, { waitUntil: "load" });
  for (const [name, rkey, ev] of [["event-future", "cd-market"], ["event-past-harvest", "cd-opening"]]) {
    await page.goto(`${base}/events/did:plc:mockscene/${rkey}?look=ecology`, { waitUntil: "load" });
    await page.locator("h1").first().waitFor({ timeout: 8000 }).catch(() => {});
    if (rkey === "cd-opening") await page.getByTestId("harvest-composer").waitFor({ timeout: 8000 }).catch(() => problems.push(`${name} @${w}: no harvest composer`));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}/${name}-${w}.png`, fullPage: true });
    for (const f of await findings(page)) problems.push(`${name} @${w}: ${f}`);
  }
  await page.close();
  for (const c of guests.values()) await c.close();
}
await browser.close();
console.log(problems.length ? `walk: ${problems.length} mechanical finding(s):\n${problems.map((p) => `  - ${p}`).join("\n")}` : "walk: no mechanical findings");
