// Captures the "how to use the COhere app" guide: one phone screenshot per step on an iPhone-sized and
// an Android-sized screen (English, and Spanish on the iPhone), three short videos and an RSVP GIF.
// Signed-out screens come from the LIVE site, read-only: every request that is not a GET is aborted and
// nothing signs in. Everything signed in, and every step that writes (register, sign in, RSVP, harvest),
// runs against the local stack scripts/guide-capture.sh starts. Raw shots go to <out>/raw (gitignored);
// scripts/guide-frame.mjs puts them in phone frames afterwards.
//
//   node scripts/guide-capture.mjs <local-worker-url> <live-url> <out-dir> <live-dir>
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { chromium } from "playwright";

const [base, live, out, dir] = process.argv.slice(2);
if (!base || !live || !out || !dir) { console.error("usage: node scripts/guide-capture.mjs <local-url> <live-url> <out-dir> <live-dir>"); process.exit(2); }
const picks = JSON.parse(await readFile(`${dir}/picks.json`, "utf8"));
const keys = JSON.parse(await readFile(`${dir}/push-keys.json`, "utf8"));
const ONLY = process.env.GUIDE_ONLY ? new Set(process.env.GUIDE_ONLY.split(",")) : null;
const DID = picks.did;
const LIVE_DID = "did:plc:w54s52ycbw5lreyhlzexredb";
const ev = (rkey) => `/events/${DID}/${rkey}`;
const denver = (offsetDays = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date(Date.now() + offsetDays * 864e5));

const DEVICES = {
  iphone: {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  },
  android: {
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  },
};
const PHOTO = execFileSync("magick", ["src/assets/photos/gathering.webp", "-resize", "1200x1200>", "-quality", "80", "jpeg:-"]);
const problems = [];
const DEVICE_IDS = { iphone: randomUUID(), android: randomUUID() };
const registered = new Set();
const browser = await chromium.launch();

/**
 * One phone. `live` contexts may only GET. `session` signs in as a mock persona. `app` pretends COhere
 * is installed on the Home Screen with notifications allowed (as scripts/notify-e2e.mjs does).
 * `androidPrompt` fires a stand-in for Chrome's install prompt. The install invite is marked as already
 * offered unless `invite` is set, so it doesn't cover other steps.
 */
async function phone(device, { site = base, session = null, app = false, androidPrompt = false, invite = false, video = null } = {}) {
  const context = await browser.newContext({
    ...DEVICES[device], baseURL: site, serviceWorkers: "block", locale: "en-US", timezoneId: "America/Denver",
    ...(video ? { recordVideo: { dir: video, size: DEVICES[device].viewport } } : {}),
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith("youtube.com") || url.hostname.endsWith("youtube-nocookie.com")) return route.fulfill({ contentType: "text/html", body: "" });
    if (site !== base && !["GET", "HEAD"].includes(route.request().method())) return route.abort();
    return route.continue();
  });
  if (session) await context.addCookies([{ name: "__Host-rs_session", value: session, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  await context.addInitScript(({ app, androidPrompt, invite, keys }) => {
    try {
      localStorage.setItem("cohere-look", "ecology");
      if (!invite) localStorage.setItem("cohere-install-offered", "true");
    } catch { return; }
    if (androidPrompt) {
      const fire = () => {
        const e = new Event("beforeinstallprompt");
        e.prompt = async () => {};
        e.userChoice = new Promise(() => {});
        window.dispatchEvent(e);
      };
      window.addEventListener("load", () => setTimeout(fire, 300));
    }
    if (!app) return;
    localStorage.setItem("cohere-companion-device", app);
    localStorage.setItem("cohere-push-off", "false");
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => (query === "(display-mode: standalone)" ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : original(query));
    const sub = { toJSON: () => ({ endpoint: keys.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }), unsubscribe: async () => true };
    Object.defineProperty(window, "PushManager", { value: class {} });
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Notification.requestPermission = async () => "granted";
    const registration = { pushManager: { getSubscription: async () => sub, subscribe: async () => sub } };
    Object.defineProperty(navigator.serviceWorker, "ready", { value: Promise.resolve(registration) });
    navigator.serviceWorker.getRegistration = async () => registration;
  }, { app: app ? DEVICE_IDS[device] : false, androidPrompt, invite, keys });
  // The installed app has told the Worker about its push subscription, as a real phone would.
  if (app && session && !registered.has(device)) {
    registered.add(device);
    const res = await fetch(`${base}/api/companion/subscriptions`, {
      method: "POST", headers: { "content-type": "application/json", origin: base, cookie: `__Host-rs_session=${session}` },
      body: JSON.stringify({ device_id: DEVICE_IDS[device], endpoint: keys.endpoint, p256dh: keys.p256dh, auth: keys.auth, language: "en" }),
    });
    if (!res.ok) problems.push(`subscriptions answered ${res.status}`);
  }
  return context;
}

async function open(context, path, lang) {
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`${path}: page error ${String(e).slice(0, 160)}`));
  await page.goto(path, { waitUntil: "load" });
  await page.locator("h1, h2").first().waitFor({ timeout: 10000 }).catch(() => problems.push(`${path}: no heading in 10 s`));
  if (lang === "es") await setSpanish(page);
  await page.waitForTimeout(900);
  return page;
}
async function setSpanish(page) {
  await page.getByRole("button", { name: "Español", exact: true }).locator("visible=true").first().click({ timeout: 4000 }).catch(() => problems.push(`${page.url()}: no Spanish toggle`));
}

/** Viewport shot (what a phone shows), optionally scrolled so `focus` sits near the top. */
async function shot(page, set, name, { focus = null, offset = 90, full = false } = {}) {
  if (focus) {
    await page.locator(focus).first().evaluate((el, offset) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "instant" }), offset).catch(() => problems.push(`${set}/${name}: no ${focus}`));
  }
  await page.waitForTimeout(500);
  await mkdir(`${out}/raw/${set}`, { recursive: true });
  await page.screenshot({ path: `${out}/raw/${set}/${name}.png`, fullPage: full, animations: "disabled", caret: "hide" });
  const sx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (sx > 0) problems.push(`${set}/${name}: page scrolls sideways by ${sx}px`);
}
const run = async (label, fn) => {
  if (ONLY && !ONLY.has(label)) return;
  try { await fn(); } catch (e) { problems.push(`${label}: step failed: ${String(e).split("\n")[0].slice(0, 200)}`); }
};

/** Pia starts each run with nothing shared, so every phone shows the composer. */
async function clearMyHarvests(page) {
  const removed = await page.evaluate(async () => {
    const mine = await (await fetch("/api/harvests/mine")).json();
    const list = mine.harvests ?? mine.items ?? (Array.isArray(mine) ? mine : []);
    for (const h of list) await fetch(`/api/harvests/${h.id}`, { method: "DELETE" });
    return list.length;
  });
  if (removed) await page.reload();
}

let emailCounter = 0;
const newcomerEmail = () => `river.${Date.now().toString(36)}${emailCounter++}@example.org`;

/** Fills the registration form the way a newcomer would: name, email, and yes to email updates. */
async function fillRegistration(page, email, { slow = false } = {}) {
  const type = async (loc, text) => { await loc.scrollIntoViewIfNeeded(); await loc.click(); await loc.pressSequentially(text, { delay: slow ? 45 : 0 }); };
  await type(page.locator("#field-full_name"), "River Okafor");
  await type(page.locator("#field-email"), email);
  const updates = page.locator("#field-subscribed");
  if (await updates.count()) {
    await updates.scrollIntoViewIfNeeded();
    if (slow) await page.waitForTimeout(600);
    if ((await updates.getAttribute("aria-checked")) !== "true") await updates.click();
  }
}
const submitButton = (page) => page.locator("form:has(#field-email) button[type=submit]");

const SETS = process.env.GUIDE_SETS ? new Set(process.env.GUIDE_SETS.split(",")) : null;
for (const [device, langs] of [["iphone", ["en", "es"]], ["android", ["en"]]]) for (const lang of langs) {
  const set = `${device}-${lang}`;
  if (SETS && !SETS.has(set)) continue;

  // 01 Home, 02 the registration form: live, signed out, read-only.
  await run("live", async () => {
    const ctx = await phone(device, { site: live });
    let page = await open(ctx, "/", lang);
    await shot(page, set, "01-home");
    await page.close();
    page = await open(ctx, "/register", lang);
    await shot(page, set, "02-register-form", { focus: "main h1", offset: 80 });
    await page.close();
    await ctx.close();
  });

  // 03 the thank-you after registering, 04–05 signing in: local (they write).
  await run("register", async () => {
    const ctx = await phone(device);
    const page = await open(ctx, "/register", lang);
    const email = newcomerEmail();
    await fillRegistration(page, email);
    await submitButton(page).click();
    await page.getByTestId("register-create-account").waitFor({ timeout: 10000 });
    await shot(page, set, "03-register-thanks", { focus: "[data-testid=register-create-account]", offset: 470 });
    await page.getByTestId("register-create-account").click();
    await page.locator("#regenos-email-dialog, #regenos-email").first().waitFor({ timeout: 6000 });
    await shot(page, set, "04-signin");
    await page.locator("form:has(#regenos-email-dialog, #regenos-email) button[type=submit]").first().click();
    await page.waitForTimeout(1200);
    await shot(page, set, "05-signin-check-email");
    await page.close();
    await ctx.close();
  });

  // 06 the install invite a signed-in phone gets (iPhone: the Share steps; Android: one button).
  await run("install", async () => {
    const ctx = await phone(device, { session: "mock-peer", invite: true, androidPrompt: device === "android" });
    const page = await open(ctx, "/today", lang);
    await page.locator('[role="dialog"]').waitFor({ timeout: 12000 });
    await page.waitForTimeout(700);
    await shot(page, set, "06-install");
    await page.close();
    // The same steps stay on Me.
    const me = await open(ctx, "/more", lang);
    await shot(me, set, "06b-install-me");
    await me.close();
    await ctx.close();
  });

  // 07 notifications: in the installed app, the Phone/Email choice; and without the app, email.
  await run("notifications", async () => {
    const ctx = await phone(device, { session: "mock-peer", app: true });
    const page = await open(ctx, "/more/notifications", lang);
    await page.waitForTimeout(800);
    await shot(page, set, "07-notifications");
    await shot(page, set, "07b-notifications-more", { focus: "main h1", offset: -420 });
    await page.close();
    await ctx.close();
    const ctx2 = await phone(device, { session: "mock-peer" });
    const page2 = await open(ctx2, "/more/notifications", lang);
    await page2.waitForTimeout(800);
    await shot(page2, set, "07c-notifications-email");
    await page2.close();
    await ctx2.close();
  });

  // 08 Today, 09–12 Calendar, 13–14 an event and its RSVP, 15–17 a harvest, 18 Board, 19 People.
  await run("member", async () => {
    const ctx = await phone(device, { session: "mock-peer", app: true });
    let page = await open(ctx, "/today", lang);
    await shot(page, set, "08-today");
    await shot(page, set, "08b-today-practice", { focus: ".practice, [data-testid=practice], article", offset: 70 });
    await page.close();

    page = await open(ctx, "/calendar", lang);
    await shot(page, set, "09-calendar");
    await page.close();
    page = await open(ctx, `/calendar?day=${denver(1)}`, lang);
    await shot(page, set, "10-calendar-day", { focus: "[data-testid=event-card]", offset: 230 });
    const pressed = await page.locator("[data-testid=event-card]").evaluateAll((cards) => cards.map((c) => c.querySelector("[data-testid=card-rsvp]")?.getAttribute("aria-pressed") ?? "none"));
    const card = page.locator("[data-testid=event-card]").nth(pressed.indexOf("false"));
    await card.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 200, behavior: "instant" }));
    await card.getByTestId("card-rsvp").click();
    await card.locator("[data-testid=card-rsvp][aria-pressed=true]").waitFor({ timeout: 8000 });
    await page.waitForTimeout(500);
    await shot(page, set, "11-calendar-rsvp");
    await page.locator("[data-testid=my-events-toggle] button").nth(1).click();
    await page.waitForTimeout(600);
    await shot(page, set, "12-calendar-my-events", { focus: "[data-testid=my-events-toggle]", offset: 200 });
    // Undo it, so every phone starts from the same calendar.
    await page.locator("[data-testid=my-events-toggle] button").nth(0).click();
    await card.locator("[data-testid=card-rsvp][aria-pressed=true]").click();
    await page.waitForTimeout(800);
    await page.close();
    page = await open(ctx, `/calendar?day=${denver(-2)}`, lang);
    await shot(page, set, "13-calendar-past-day", { focus: "[data-testid=event-card]", offset: 230 });
    await page.close();

    page = await open(ctx, ev(picks.rsvp), lang);
    await shot(page, set, "14-event");
    const rsvp = page.getByTestId("event-rsvp");
    await rsvp.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 160, behavior: "instant" }));
    await page.waitForTimeout(300);
    await shot(page, set, "15-event-rsvp");
    const going = rsvp.getByTestId("rsvp-state");
    if (!(await going.count())) {
      await rsvp.getByRole("button").first().click();
      await going.waitFor({ timeout: 8000 });
    }
    await page.waitForTimeout(500);
    await shot(page, set, "16-event-going");
    // Leave it as it was for the next phone.
    await going.click();
    await page.waitForTimeout(800);
    await page.close();

    page = await open(ctx, ev(picks.harvest), lang);
    await clearMyHarvests(page);
    await page.getByTestId("harvest-composer").waitFor({ timeout: 10000 });
    await shot(page, set, "17-harvest-composer", { focus: "[data-testid=harvest-composer]", offset: 120 });
    await page.locator("#hv-t").fill(lang === "es" ? "Fría, quieta y clara. Escuché el arroyo distinto cuando dejamos de hablar." : "Cold and clear. We stood by the creek without talking, and I heard it differently.");
    await page.getByTestId("harvest-photo-input").setInputFiles({ name: "creek.jpg", mimeType: "image/jpeg", buffer: PHOTO });
    await page.locator(".compose .ph img").waitFor({ timeout: 8000 }).catch(() => {});
    await shot(page, set, "18-harvest-filled", { focus: "[data-testid=harvest-composer]", offset: 120 });
    await page.getByTestId("harvest-share").click();
    await page.getByTestId("harvest-mine").waitFor({ timeout: 12000 });
    await page.waitForTimeout(4500); // let the "Shared." toast go
    await shot(page, set, "19-harvest-shared", { focus: "[data-testid=harvest-mine]", offset: 140 });
    await page.getByTestId("harvest-menu").click();
    await page.getByRole("menu").waitFor();
    await shot(page, set, "20-harvest-menu");
    await page.keyboard.press("Escape");
    // Delete it, so the next phone can share one too.
    await page.getByTestId("harvest-menu").click();
    await page.getByTestId("harvest-menu-delete").click();
    await page.getByRole("dialog").waitFor();
    await shot(page, set, "20b-harvest-delete");
    await page.getByTestId("harvest-delete-yes").click();
    await page.getByTestId("harvest-composer").waitFor({ timeout: 10000 });
    await page.close();

    page = await open(ctx, "/board", lang);
    await page.waitForTimeout(800);
    await shot(page, set, "21-board");
    await page.close();
    page = await open(ctx, "/people", lang);
    await page.waitForTimeout(800);
    await shot(page, set, "22-people");
    await page.close();
    page = await open(ctx, "/more", lang);
    await shot(page, set, "23-me");
    await page.close();
    await ctx.close();
  });
}

// Videos on the iPhone, English: register → sign in; RSVP; share a harvest. MP4 (H.264) under 5 MB, and a GIF of the RSVP.
async function record(name, fn, opts = {}) {
  const vdir = `${out}/raw/video-${name}`;
  await rm(vdir, { recursive: true, force: true });
  const ctx = await phone("iphone", { ...opts, video: vdir });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`video ${name}: page error ${String(e).slice(0, 160)}`));
  await fn(page);
  await page.waitForTimeout(1200);
  const raw = await page.video().path();
  await page.close();
  await ctx.close();
  await mkdir(`${out}/video`, { recursive: true });
  const mp4 = `${out}/video/${name}.mp4`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "28", "-preset", "slow", "-movflags", "+faststart", "-an", mp4]);
  await rename(raw, `${vdir}/${name}.webm`);
  return mp4;
}
const tap = async (page, locator) => { await locator.scrollIntoViewIfNeeded(); await page.waitForTimeout(450); await locator.click(); };

await run("video-register", () => record("register-and-sign-in", async (page) => {
  await page.goto("/register"); await page.locator("form").first().waitFor();
  await page.waitForTimeout(1500);
  await fillRegistration(page, newcomerEmail(), { slow: true });
  await tap(page, submitButton(page));
  await page.getByTestId("register-create-account").waitFor({ timeout: 10000 });
  await page.getByTestId("register-create-account").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2200);
  await tap(page, page.getByTestId("register-create-account"));
  await page.locator("#regenos-email-dialog, #regenos-email").first().waitFor({ timeout: 6000 });
  await page.waitForTimeout(1800);
  await tap(page, page.locator("form:has(#regenos-email-dialog, #regenos-email) button[type=submit]").first());
  await page.waitForTimeout(3000);
}));

await run("video-rsvp", () => record("rsvp", async (page) => {
  await page.goto(`/calendar?day=${denver(1)}`); await page.locator("[data-testid=event-card]").first().waitFor();
  await page.waitForTimeout(1500);
  const pressed = await page.locator("[data-testid=event-card]").evaluateAll((cards) => cards.map((c) => c.querySelector("[data-testid=card-rsvp]")?.getAttribute("aria-pressed") ?? "none"));
  const card = page.locator("[data-testid=event-card]").nth(pressed.indexOf("false"));
  await card.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 220, behavior: "smooth" }));
  await page.waitForTimeout(1500);
  await card.locator("h3 a").click();
  await page.getByTestId("event-rsvp").waitFor({ timeout: 10000 });
  await page.waitForTimeout(1800);
  const rsvp = page.getByTestId("event-rsvp");
  await rsvp.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 200, behavior: "smooth" }));
  await page.waitForTimeout(1500);
  await rsvp.getByRole("button").first().click();
  await rsvp.getByTestId("rsvp-state").waitFor({ timeout: 8000 });
  await page.waitForTimeout(2500);
  // Undo it quietly afterwards (not filmed: the video ends on "Going").
}, { session: "mock-peer", app: true }));

await run("video-harvest", () => record("share-a-harvest", async (page) => {
  await page.goto(ev(picks.harvest));
  await clearMyHarvests(page);
  await page.getByTestId("harvest-composer").waitFor({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.getByTestId("harvest-composer").evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" }));
  await page.waitForTimeout(1500);
  await page.locator("#hv-t").click();
  await page.locator("#hv-t").pressSequentially("Cold and clear. We stood by the creek without talking.", { delay: 40 });
  await page.waitForTimeout(600);
  await page.getByTestId("harvest-photo-input").setInputFiles({ name: "creek.jpg", mimeType: "image/jpeg", buffer: PHOTO });
  await page.locator(".compose .ph img").waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await tap(page, page.getByTestId("harvest-share"));
  await page.getByTestId("harvest-mine").waitFor({ timeout: 12000 });
  await page.getByTestId("harvest-mine").evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 140, behavior: "smooth" }));
  await page.waitForTimeout(2800);
}, { session: "mock-peer", app: true }));

if (!ONLY || ONLY.has("video-rsvp")) {
  const mp4 = `${out}/video/rsvp.mp4`;
  try {
    await stat(mp4);
    const gif = `${out}/video/rsvp.gif`;
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf", "fps=10,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", gif]);
  } catch (e) { problems.push(`gif: ${String(e).slice(0, 160)}`); }
}

await browser.close();
console.log(problems.length ? `guide-capture: ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}` : "guide-capture: no problems");
