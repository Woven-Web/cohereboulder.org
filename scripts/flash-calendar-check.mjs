// Measures the four things the flash/calendar pass fixes, on the local walk stack
// (scripts/walk-oct19-stack.sh + walk-oct19-seed.mjs), and takes the before/after screens:
//   1. what the masthead (and the calendar's host card) says while a signed-in member loads;
//   2. layout shift (CLS) on /calendar's first paint at 390 and 1280;
//   3. week-grid titles broken mid-word at 1280 with Your next beside the grid;
//   4. whether Day/Week survives a reload.
// Only ever talks to 127.0.0.1. Prints one JSON report and exits 1 if any check fails.
//
//   node scripts/flash-calendar-check.mjs <state-dir> <before|after> <out-dir>
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const [state, label, out] = process.argv.slice(2);
if (!state || !label || !out) { console.error("usage: node scripts/flash-calendar-check.mjs <state-dir> <before|after> <out-dir>"); process.exit(2); }
await mkdir(out, { recursive: true });
const env = Object.fromEntries((await readFile(`${state}/env`, "utf8")).trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)));
const { BASE } = env;
const DID = "did:plc:mockscene";
// The session answer is slowed by this much, as a real round trip to regenOS is.
const SESSION_DELAY = Number(process.env.SESSION_DELAY ?? 600);

const browser = await chromium.launch();
async function ctx({ width = 390, height = 844, cookie, at = "2026-10-20T19:00:00Z" } = {}) {
  const c = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  await c.clock.setFixedTime(new Date(at));
  await c.addInitScript(() => {
    try { localStorage.setItem("cohere-look", "ecology"); localStorage.removeItem("cohere.calendar.view"); } catch { /* opaque frame */ }
    // Layout shifts, and every masthead / host-card text it showed, with the time it showed it.
    window.__cls = 0; window.__shifts = []; window.__mast = []; window.__host = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue;
          window.__cls += e.value;
          window.__shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), nodes: (e.sources ?? []).map((s) => s.node?.className || s.node?.nodeName || "?").slice(0, 4) });
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch { /* no layout-shift API */ }
    const record = () => {
      const t = Math.round(performance.now());
      const end = document.querySelector(".mast__end");
      const visible = (el) => el && el.checkVisibility?.({ visibilityProperty: true }) !== false;
      if (end) {
        const words = [...end.querySelectorAll("a,button,[role=status]")].filter((el) => !el.closest(".lang") && visible(el)).map((el) => el.textContent.trim()).filter(Boolean).join(" | ");
        if (window.__mast.at(-1)?.text !== words) window.__mast.push({ t, text: words });
      }
      // The propose card and the hosting line under it (the old build has no test id on them).
      const tagged = document.querySelector("[data-testid=calendar-host]");
      const parts = tagged ? [tagged] : [...(document.querySelector("main .bg-paper-3")?.parentElement?.querySelectorAll(":scope > .bg-paper-3, :scope > .space-y-4") ?? [])];
      const htext = parts.filter(visible).map((el) => el.innerText).join(" ").replace(/\s+/g, " ").trim();
      if (window.__host.at(-1)?.text !== htext) window.__host.push({ t, text: htext });
    };
    new MutationObserver(record).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await c.route("**/*", (r) => (new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort()));
  if (cookie) await c.addCookies([{ name: "__Host-rs_session", value: cookie, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  return c;
}
const slowSession = (p) => p.route("**/xrpc/social.scenius.getSession", async (r) => { await new Promise((ok) => setTimeout(ok, SESSION_DELAY)); await r.continue(); });
const shot = (page, name, opts = {}) => page.screenshot({ path: `${out}/${name}-${label}.png`, ...opts });
const report = { label, sessionDelayMs: SESSION_DELAY };
const failures = [];
const check = (ok, what) => { if (!ok) failures.push(what); };

// Pia (mock-peer) RSVPs to two events, so Your next sits beside the calendar.
{
  const c = await ctx({ cookie: "mock-peer" }); const p = await c.newPage();
  for (const rkey of ["wk-potluck-20", "wk-story-21"]) {
    await p.goto(`${BASE}/events/${DID}/${rkey}`); await p.getByTestId("event-rsvp").waitFor();
    await p.waitForTimeout(800);
    if (!(await p.getByRole("button", { name: /Cancel my RSVP/i }).count())) {
      await p.getByTestId("event-rsvp").getByRole("button", { name: /^RSVP/i }).first().click(); await p.waitForTimeout(1200);
    }
  }
  await c.close();
}

// 1 + 2. A signed-in member and a signed-out visitor load /calendar, at both sizes.
const SIGNED_OUT_WORDS = /Join COhere|Sign in|\bAbout\b/;
for (const [who, cookie] of [["member", "mock-peer"], ["visitor", undefined]]) {
  for (const width of [390, 1280]) {
    const c = await ctx({ width, height: width === 390 ? 844 : 800, cookie }); const p = await c.newPage();
    // A member has used the site on this device before (that is how the session cookie got here): one
    // earlier visit, then the measured one.
    if (cookie) { await p.goto(`${BASE}/`); await p.waitForLoadState("networkidle"); await p.waitForTimeout(500); await slowSession(p); }
    const t0 = Date.now();
    await p.goto(`${BASE}/calendar`, { waitUntil: "commit" });
    for (const t of [300, 700]) { await p.waitForTimeout(Math.max(0, t - (Date.now() - t0))); await shot(p, `calendar-${who}-${width}-${t}ms`); }
    await p.locator(cookie ? "[data-testid=your-next]" : ".trail").first().waitFor({ timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(2500);
    await shot(p, `calendar-${who}-${width}-settled`);
    const r = await p.evaluate(() => ({ cls: +window.__cls.toFixed(4), shifts: window.__shifts, mast: window.__mast, host: window.__host }));
    report[`${who}-${width}`] = r;
    check(r.cls < 0.1, `${who} ${width}: CLS ${r.cls} is not under 0.1`);
    if (cookie) {
      const flashed = r.mast.filter((m) => SIGNED_OUT_WORDS.test(m.text));
      check(flashed.length === 0, `${who} ${width}: masthead showed signed-out words: ${flashed.map((m) => `${m.t}ms "${m.text}"`).join("; ")}`);
      const hostFlash = r.host.filter((h) => /Sign in|Have an account|account/i.test(h.text));
      check(hostFlash.length === 0, `${who} ${width}: host card showed signed-out words: ${hostFlash.map((h) => `${h.t}ms "${h.text.slice(0, 80)}"`).join("; ")}`);
    }
    await c.close();
  }
}

// 3. The week grid at 1280 beside Your next: any title broken inside a word?
{
  const c = await ctx({ width: 1280, height: 800, cookie: "mock-peer" }); const p = await c.newPage();
  await p.goto(`${BASE}/calendar`); await p.getByTestId("calendar-week").waitFor({ timeout: 10000 });
  await p.getByTestId("your-next").waitFor({ timeout: 10000 }); await p.waitForTimeout(800);
  const titles = await p.$$eval(".week__ev b", (els) => els.map((b) => {
    // Every word of every text node: does it sit on more than one line?
    const broken = [];
    const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let i = 0;
      for (const word of node.data.split(" ")) {
        if (word) {
          const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + word.length);
          if (new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size > 1) broken.push(word);
        }
        i += word.length + 1;
      }
    }
    // A word cut short must say so: the box that clips it draws the ellipsis.
    const boxes = [...b.querySelectorAll(".week__word")];
    const clipped = boxes.length ? boxes.filter((w) => w.scrollWidth > w.clientWidth + 1) : b.scrollWidth > b.clientWidth + 1 ? [b] : [];
    return { text: b.textContent, broken, cut: clipped.length > 0, ellipsis: clipped.every((el) => getComputedStyle(el).textOverflow === "ellipsis") };
  }));
  report.weekTitles = titles;
  const broken = titles.filter((t) => t.broken.length);
  check(broken.length === 0, `week 1280: titles broken mid-word: ${broken.map((t) => `${t.text} (${t.broken.join(",")})`).join("; ")}`);
  const cut = titles.filter((t) => t.cut && !t.ellipsis);
  check(cut.length === 0, `week 1280: titles clipped with no ellipsis: ${cut.map((t) => t.text).join("; ")}`);
  await p.getByTestId("calendar-week").scrollIntoViewIfNeeded();
  await shot(p, "week-1280-your-next");
  await p.getByTestId("calendar-week").screenshot({ path: `${out}/week-grid-1280-${label}.png` });
  await c.close();
}

// 4. Day/Week in the URL.
{
  const c = await ctx({ width: 1280, height: 800, cookie: "mock-peer" }); const p = await c.newPage();
  const viewNow = async () => ((await p.getByTestId("calendar-week").count()) ? "week" : "day");
  await p.goto(`${BASE}/calendar?day=2026-10-21`); await p.locator(".cal-view").waitFor({ timeout: 10000 }); await p.waitForTimeout(600);
  const opened = await viewNow();
  await p.locator(".cal-view").getByRole("button", { name: "Week", exact: true }).click(); await p.waitForTimeout(400);
  const afterPick = { url: p.url().replace(BASE, ""), view: await viewNow() };
  await p.reload(); await p.locator(".cal-view").waitFor({ timeout: 10000 }); await p.waitForTimeout(600);
  const afterReload = { url: p.url().replace(BASE, ""), view: await viewNow() };
  await shot(p, "url-week-after-reload");
  await p.locator(".cal-view").getByRole("button", { name: "Day", exact: true }).click(); await p.waitForTimeout(400);
  const afterDay = { url: p.url().replace(BASE, ""), view: await viewNow() };
  await p.reload(); await p.locator(".cal-view").waitFor({ timeout: 10000 }); await p.waitForTimeout(600);
  const afterDayReload = { url: p.url().replace(BASE, ""), view: await viewNow() };
  report.url = { opened, afterPick, afterReload, afterDay, afterDayReload };
  check(opened === "day", `url: ?day= alone opened ${opened}, not day`);
  check(/view=week/.test(afterPick.url), `url: picking Week left the URL at ${afterPick.url}`);
  check(afterReload.view === "week", `url: reload after Week showed ${afterReload.view}`);
  check(afterDayReload.view === "day", `url: reload after Day showed ${afterDayReload.view}`);
  await c.close();
}

await browser.close();
report.failures = failures;
console.log(JSON.stringify(report, null, 1));
console.log(failures.length ? `flash-calendar (${label}): ${failures.length} check(s) failed:\n${failures.map((f) => `  - ${f}`).join("\n")}` : `flash-calendar (${label}): all checks passed`);
process.exit(failures.length ? 1 : 0);
