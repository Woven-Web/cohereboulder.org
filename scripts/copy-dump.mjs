// Dumps the visible text of each ecology screen (en + es, signed out + in) for the copy audit.
//   node scripts/copy-dump.mjs <worker> <mock> <out.json>
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const [base, mock, out] = process.argv.slice(2);
const EV = "ev-eco-e2e-1";
await fetch(`${mock}/xrpc/social.scenius.createEvent`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mock-token" }, body: JSON.stringify({ authority: "did:plc:mockscene", rkey: EV, name: "Ecology Free Market", description: "A real-enough description.", startsAt: "2026-10-17T16:00:00.000Z", endsAt: "2026-10-17T19:00:00.000Z", mode: "inperson", placeName: "Martin Park", locality: "Boulder", region: "CO", attendance: "open" }) });
const PAGES = ["/", "/today", "/tomorrow", "/calendar", `/events/did:plc:mockscene/${EV}`, "/board", "/people", "/profile", "/more", "/more/notifications", "/about", "/co-create", "/register", "/login", "/propose", "/archive", "/join-2025", "/presskit", "/nope", "/n/badtoken", "/telegram"];
const browser = await chromium.launch();
const res = {};
for (const lang of ["en", "es"]) for (const member of [null, "mock-peer"]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.clock.setFixedTime(new Date("2026-10-17T16:00:00Z"));
  await context.route("https://www.youtube.com/**", (r) => r.fulfill({ contentType: "text/html", body: "" }));
  if (member) await context.addCookies([{ name: "__Host-rs_session", value: member, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  for (const p of PAGES) {
    await page.goto(`${base}${p}?look=ecology`, { waitUntil: "load" });
    if (lang === "es") await page.getByRole("button", { name: /^ES$|Español/ }).first().click().catch(() => {});
    await page.waitForTimeout(900);
    const text = await page.evaluate(() => document.body.innerText + "\n[placeholders] " + [...document.querySelectorAll("[placeholder],[aria-label],[alt]")].map((e) => e.getAttribute("placeholder") || e.getAttribute("aria-label") || e.getAttribute("alt")).join(" | "));
    res[`${lang}:${member ? "in" : "out"}:${p}`] = text;
  }
  await context.close();
}
await browser.close();
await writeFile(out, JSON.stringify(res, null, 1));
