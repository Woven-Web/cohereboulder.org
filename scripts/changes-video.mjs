// Records the captioned video tour of what changed in the COhere app on Oct 16–17, then edits it with
// ffmpeg into one MP4 plus one MP4 and one poster PNG per segment. Runs only against the local stack
// scripts/changes-video.sh starts (it refuses any other worker URL); nothing is sent anywhere.
//
//   node scripts/changes-video.mjs <local-worker-url> <regenos-mock-url> <out-dir> <push-keys.json> <digest.html>
//
// TOUR_ONLY=01,04 re-records only those segments; the tour is then rebuilt from every segment on disk.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const [base, mock, out, keysFile, digestHtml] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base ?? "") || !/^http:\/\/127\.0\.0\.1:\d+$/.test(mock ?? "") || !out || !keysFile || !digestHtml) {
  console.error("usage: node scripts/changes-video.mjs <http://127.0.0.1:port> <http://127.0.0.1:port> <out-dir> <push-keys.json> <digest.html>");
  process.exit(2);
}
// TOUR_EDIT_ONLY=1 skips recording and rebuilds the videos from video-tour/raw.
const EDIT_ONLY = process.env.TOUR_EDIT_ONLY === "1";
const keys = EDIT_ONLY ? {} : JSON.parse(await readFile(keysFile, "utf8"));
const ONLY = process.env.TOUR_ONLY ? new Set(process.env.TOUR_ONLY.split(",")) : null;
const RAW = `${out}/raw`;
await mkdir(RAW, { recursive: true });
const SCENE = "did:plc:mockscene";
const problems = [];

// ── The canvas: a 1280×720 frame, a caption band on top, the screen below it ─────────────────────
const W = 1280, H = 720, BAND = 96, CONTENT = H - BAND;
const LAPTOP = { width: 1280, height: CONTENT };
const IPHONE = {
  viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
};

// ── Local data: the gathering's calendar, a few RSVPs and harvests (all in the mock / local D1) ──
const z = (s) => new Date(s).toISOString();
const EVENTS = [
  ["op-opening", "Opening Invocation", "2026-10-15T17:00:00-06:00", "2026-10-15T19:00:00-06:00", "Boulder Creek Path", "We open the ten days together by the creek: a welcome, a song, and a moment of quiet."],
  ["op-potluck", "Welcome Potluck", "2026-10-15T19:15:00-06:00", "2026-10-15T21:00:00-06:00", "Eben G. Fine Park", "Bring a dish to share and a chair if you have one."],
  ["op-sit", "Morning Sit by the Creek", "2026-10-16T07:30:00-06:00", "2026-10-16T08:30:00-06:00", "Boulder Creek Path", "Sit quietly by the water. Come and go as you like."],
  ["op-market", "Free Market", "2026-10-17T10:00:00-06:00", "2026-10-17T13:00:00-06:00", "Martin Park", "Bring what you no longer need; take what you do."],
  ["op-song", "Song Circle", "2026-10-17T18:00:00-06:00", "2026-10-17T19:30:00-06:00", "Chautauqua Green", "Open songs, rounds and call-and-response. No experience needed."],
  ["op-seeds", "Seed Saving Skill Share", "2026-10-18T10:00:00-06:00", "2026-10-18T12:00:00-06:00", "Boulder Public Library", "Learn to save seeds from this year's garden, and take some home."],
  ["op-ride", "Bike Ride to the Reservoir", "2026-10-18T13:00:00-06:00", "2026-10-18T15:00:00-06:00", "Scott Carpenter Park", "An easy ride. Bring water and a layer."],
  ["op-story", "Story Night", "2026-10-18T19:00:00-06:00", "2026-10-18T21:00:00-06:00", "The Old Barn", "Tell a story about a place you love, or come to listen."],
  ["op-willow", "Willow Planting on Boulder Creek", "2026-10-19T09:00:00-06:00", "2026-10-19T11:30:00-06:00", "Boulder Creek Path", "Plant willow stakes along the bank with the watershed crew."],
  // The mock's own "Seed Gathering" at "Mock Hall", renamed so the calendar reads like the real one.
  ["ev-seed1", "Closing Circle", "2026-10-24T16:00:00-06:00", "2026-10-24T18:00:00-06:00", "Chautauqua Green", "We close the ten days together."],
];
async function seed() {
  for (const [rkey, name, startsAt, endsAt, placeName, description] of EVENTS) {
    const r = await fetch(`${mock}/xrpc/social.scenius.createEvent`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mock-token" },
      body: JSON.stringify({ authority: SCENE, rkey, name, description, startsAt: z(startsAt), endsAt: z(endsAt), mode: "inperson", placeName, locality: "Boulder", region: "CO", attendance: "open" }) });
    if (!r.ok) throw new Error(`seed event ${rkey}: ${r.status}`);
  }
  // Pia (mock-peer, the member most segments sign in as) is going to tonight's song circle and tomorrow's skill share.
  for (const rkey of ["op-song", "op-seeds"]) {
    const r = await fetch(`${mock}/xrpc/social.scenius.rsvp`, { method: "POST", headers: { "content-type": "application/json", cookie: "__Host-rs_session=mock-peer" }, body: JSON.stringify({ eventDid: SCENE, eventRkey: rkey, intent: "going" }) });
    if (!r.ok) throw new Error(`seed rsvp ${rkey}: ${r.status}`);
  }
  // Harvests other members already shared on the opening (Oct 15).
  const jpeg = (file) => `data:image/jpeg;base64,${execFileSync("magick", [file, "-resize", "900x900>", "-quality", "72", "jpeg:-"]).toString("base64")}`;
  for (const [who, rkey, body, photo] of [
    ["guide-mara", "op-opening", "So many people I had only met online, all in one circle by the water.", "src/assets/photos/shared-meal.webp"],
    ["guide-teo", "op-opening", "The invocation reminded me why I moved here. I left with three new neighbours' phone numbers.", null],
  ]) {
    const r = await fetch(`${base}/api/harvests`, { method: "POST", headers: { "content-type": "application/json", origin: base, cookie: `__Host-rs_session=${who}` },
      body: JSON.stringify({ eventDid: SCENE, eventRkey: rkey, body, lang: "en", ...(photo ? { photo: jpeg(photo) } : {}) }) });
    if (r.status !== 201 && r.status !== 409) throw new Error(`seed harvest ${who}: ${r.status} ${await r.text()}`);
  }
}

// ── Recording helpers ─────────────────────────────────────────────────────────────────────────
const browser = EDIT_ONLY ? null : await chromium.launch();
const DEVICE = randomUUID();
let registered = false;

/** A visible pointer (Playwright's recordings have none), with a press effect and an optional dragged-file label. */
function pointerOverlay() {
  if (window.top !== window) return;
  const make = () => {
    if (document.getElementById("__tour_pointer")) return;
    const d = document.createElement("div");
    d.id = "__tour_pointer";
    d.setAttribute("aria-hidden", "true");
    Object.assign(d.style, { position: "fixed", left: "-100px", top: "-100px", width: "28px", height: "28px", margin: "-14px 0 0 -14px", borderRadius: "50%",
      background: "rgba(237,180,88,.5)", border: "3px solid rgba(54,85,143,.9)", zIndex: "2147483647", pointerEvents: "none", transition: "transform .12s", boxSizing: "border-box" });
    const tag = document.createElement("div");
    Object.assign(tag.style, { position: "absolute", left: "26px", top: "18px", whiteSpace: "nowrap", font: "600 13px system-ui,sans-serif", padding: "6px 9px", borderRadius: "8px",
      background: "#fff", color: "#1d2a44", boxShadow: "0 3px 10px rgba(0,0,0,.25)", display: "none" });
    d.append(tag);
    document.documentElement.append(d);
    addEventListener("mousemove", (e) => { if (e.clientX < 2 && e.clientY < 2) return; d.style.left = `${e.clientX}px`; d.style.top = `${e.clientY}px`; }, true);
    addEventListener("mousedown", () => { d.style.transform = "scale(.7)"; }, true);
    addEventListener("mouseup", () => { d.style.transform = "scale(1)"; }, true);
    window.__tourDrag = (label) => { tag.textContent = label ?? ""; tag.style.display = label ? "block" : "none"; };
  };
  if (document.documentElement) make(); else addEventListener("DOMContentLoaded", make);
  addEventListener("DOMContentLoaded", make);
}

/**
 * One recorded browser. `phone` is an iPhone; `session` signs in as a mock persona; `app` pretends COhere
 * is installed with notifications allowed (as scripts/guide-capture.mjs does); `invite` lets the
 * one-time Home Screen invite show. Only the local stack and file:// are reachable.
 */
async function recorder(dir, { phone = false, mail = false, size = LAPTOP, session = null, app = false, invite = false, sw = "block" } = {}) {
  const context = await browser.newContext({
    // `mail`: a phone-width window that lays the page out at its own width, as a mail app does with an
    // email (an emulated mobile browser would lay a page with no viewport tag out at 980 px and shrink it).
    ...(phone ? (mail ? { viewport: IPHONE.viewport, deviceScaleFactor: 2 } : IPHONE) : { viewport: size, deviceScaleFactor: 1 }),
    baseURL: base, serviceWorkers: sw, locale: "en-US", timezoneId: "America/Denver",
    recordVideo: { dir, size: phone ? IPHONE.viewport : size },
  });
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(base) || url.startsWith("file:") || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    return route.fulfill({ status: 204, body: "" }); // nothing leaves this machine (fonts fall back, embeds stay empty)
  });
  if (session) await context.addCookies([{ name: "__Host-rs_session", value: session, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  await context.addInitScript(pointerOverlay);
  await context.addInitScript(({ app, invite, keys }) => {
    try {
      localStorage.setItem("cohere-look", "ecology");
      if (!invite) localStorage.setItem("cohere-install-offered", "true");
    } catch { return; }
    if (!app) return;
    localStorage.setItem("cohere-companion-device", app);
    localStorage.setItem("cohere-push-off", "false");
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => (query === "(display-mode: standalone)" ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : original(query));
    const sub = { toJSON: () => ({ endpoint: `${keys.endpoint}?device=${app}`, keys: { p256dh: keys.p256dh, auth: keys.auth } }), unsubscribe: async () => true };
    Object.defineProperty(window, "PushManager", { value: class {} });
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Notification.requestPermission = async () => "granted";
    const registration = { pushManager: { getSubscription: async () => sub, subscribe: async () => sub } };
    Object.defineProperty(navigator.serviceWorker, "ready", { value: Promise.resolve(registration) });
    navigator.serviceWorker.getRegistration = async () => registration;
  }, { app: app ? DEVICE : false, invite, keys });
  if (app && session && !registered) {
    registered = true;
    const res = await fetch(`${base}/api/companion/subscriptions`, {
      method: "POST", headers: { "content-type": "application/json", origin: base, cookie: `__Host-rs_session=${session}` },
      body: JSON.stringify({ device_id: DEVICE, endpoint: `${keys.endpoint}?device=${DEVICE}`, p256dh: keys.p256dh, auth: keys.auth, language: "en" }),
    });
    if (!res.ok) problems.push(`push subscription answered ${res.status}`);
  }
  return context;
}

/** A segment's script: `cap` starts a new caption line, `poster` marks the still, `end` closes the cut. */
function timeline(page) {
  const t0 = Date.now();
  const steps = [];
  const at = () => (Date.now() - t0) / 1000;
  return {
    t0, steps,
    start: null, end: null, poster: null,
    cap(text) { if (this.start === null) this.start = Math.max(0, at() - 0.15); steps.push({ t: at(), text }); },
    mark() { this.poster = at(); },
    stop() { this.end = at(); },
    page,
  };
}
const pause = (page, ms) => page.waitForTimeout(ms);
async function pointAt(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (!b) return;
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 22), { steps: 18 });
  await pause(page, 220);
}
async function tap(page, locator, after = 700) {
  await pointAt(page, locator);
  await locator.click();
  await pause(page, after);
}
async function type(page, locator, text, delay = 30) {
  await pointAt(page, locator);
  await locator.click();
  await locator.pressSequentially(text, { delay });
}
async function glide(page, locator, offset = 90) {
  await locator.first().evaluate((el, offset) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" }), offset);
  await pause(page, 900);
}
async function glideBy(page, dy) {
  await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: "smooth" }), dy);
  await pause(page, 900);
}
async function open(page, path) {
  await page.goto(path, { waitUntil: "load" });
  await page.locator("h1, h2").first().waitFor({ timeout: 10000 }).catch(() => problems.push(`${path}: no heading in 10 s`));
  await pause(page, 600);
}

const SEGMENTS = [];
const segment = (id, name, title, opts, fn) => SEGMENTS.push({ id, name, title, opts, fn });

// 1 ─ Newsletter photo upload (desktop, /admin as a steward)
const PHOTO = "src/assets/photos/shared-meal.webp";
segment("01", "newsletter-photo", "1 · Newsletter: add a photo from your computer", { session: "sess-steward", sw: "allow" }, async (page, tl) => {
  // /admin has no service worker; blocking one would throw inside the sandboxed preview frame.
  await page.goto("/admin", { waitUntil: "load" });
  await page.getByRole("tab", { name: "Newsletter", exact: true }).waitFor({ timeout: 15000 });
  tl.cap("Organizer page → Newsletter → New newsletter");
  await tap(page, page.getByRole("tab", { name: "Newsletter", exact: true }));
  await tap(page, page.getByRole("button", { name: "New newsletter" }), 900);
  await type(page, page.locator("#nlsubject"), "Photos from the opening", 25);
  const before = "Hello friends,\n\nWhat an opening. Here is the circle by the creek.";
  const after = "See you at the Song Circle tonight.";
  await glide(page, page.locator("#nltools"), 150);
  await type(page, page.locator("#nlbody"), `${before}\n\n${after}`, 12);
  tl.cap("Put the cursor where the photo should go");
  const ta = page.locator("#nlbody");
  const tb = await ta.boundingBox();
  await page.mouse.move(tb.x + 330, tb.y + 52, { steps: 16 });
  await page.mouse.down(); await page.mouse.up();
  await ta.evaluate((el, at) => { el.focus(); el.setSelectionRange(at, at); }, before.length);
  await pause(page, 2200);

  tl.cap("Add image opens a small panel");
  await tap(page, page.locator("#nlimgbtn"), 2400);

  tl.cap("A file that isn't a photo gets a plain message");
  const notPhoto = `${RAW}/programme.pdf`;
  await writeFile(notPhoto, "%PDF-1.4 not a photo");
  let chooser = page.waitForEvent("filechooser");
  await tap(page, page.locator("#nlimgfile"), 100);
  await (await chooser).setFiles(notPhoto);
  await pause(page, 500);
  await type(page, page.locator("#nlimgalt"), "Programme", 20);
  await tap(page, page.locator("#nlimgupload"), 2200);
  await page.locator("#nlimgalt").fill("");

  tl.cap("Choose File opens the computer's own file window (not shown in a recording)");
  chooser = page.waitForEvent("filechooser");
  await tap(page, page.locator("#nlimgfile"), 300);
  await pause(page, 1200);
  await (await chooser).setFiles(PHOTO);
  tl.cap("Picked a photo file from this computer: shared-meal.webp");
  await pause(page, 2200);

  tl.cap("Describe the photo in a few words (required)");
  await type(page, page.locator("#nlimgalt"), "Neighbours in a circle by Boulder Creek at the opening", 28);
  await pause(page, 800);
  tl.cap("Upload and insert");
  await tap(page, page.locator("#nlimgupload"), 100);
  await page.locator("#nlimgpanel").waitFor({ state: "hidden", timeout: 20000 });
  await pause(page, 600);

  tl.cap("The photo goes in where the cursor was, as one line of text");
  await glide(page, page.locator("#nltools"), 130);
  const tb1 = await ta.boundingBox();
  await page.mouse.move(tb1.x + 200, tb1.y + 72, { steps: 18 });
  await pause(page, 3000);
  tl.cap("The preview beside it shows the email as it will be sent");
  await pointAt(page, page.locator("#nlframe"));
  tl.mark();
  await pause(page, 3200);
  // The help line (if this build has one) for moving or removing the image.
  const hint = page.locator("#nlimghint");
  if (await hint.count() && await hint.isVisible()) {
    tl.cap("The line starting with ![ is the photo: move it to move, delete it to remove");
    await pointAt(page, hint);
    await pause(page, 3200);
  }

  tl.cap("Dragging a photo onto the text…");
  const bytes = (await readFile("src/assets/photos/gathering.webp")).toString("base64");
  await page.mouse.move(1240, 300, { steps: 5 });
  await page.evaluate(() => window.__tourDrag?.("gathering.webp"));
  const tb2 = await ta.boundingBox();
  await page.mouse.move(tb2.x + tb2.width / 2, tb2.y + 140, { steps: 30 });
  await pause(page, 300);
  await ta.evaluate((el, b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], "gathering.webp", { type: "image/webp" }));
    for (const type of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bytes);
  await page.evaluate(() => window.__tourDrag?.(null));
  await pause(page, 900);
  const opened = await page.locator("#nlimgpanel").isVisible();
  if (opened) {
    tl.cap("…opens the same panel with that photo chosen; describe it, then Upload");
    await pause(page, 3200);
  } else {
    tl.cap("…does nothing: dragging a file in is not supported");
    await pause(page, 3200);
  }
  tl.stop();
});

// 2 ─ Notifications (phone, Pia with the app installed)
segment("02", "notifications", "2 · Notifications: Phone or Email for each note", { phone: true, session: "mock-peer", app: true }, async (page, tl) => {
  await open(page, "/more");
  tl.cap("Me → Notifications");
  await tap(page, page.getByRole("link", { name: /^Notifications/ }).first(), 1500);
  await page.getByTestId("note-morning").waitFor({ timeout: 10000 });
  tl.cap("Each note has an on/off switch and Phone / Email");
  await pointAt(page, page.getByTestId("note-morning"));
  await pause(page, 1800);
  tl.cap("New: Event reminders, 1 hour before an event you RSVP'd to");
  await glide(page, page.getByTestId("note-reminder"), 140);
  await pointAt(page, page.getByTestId("note-reminder"));
  tl.mark();
  await pause(page, 2200);
  tl.cap("Phone and Email are separate: tap Email to get it by email as well");
  await tap(page, page.getByTestId("reminder-email"), 2600);
  tl.cap("Turn every note off…");
  for (const type of ["morning", "reminder", "harvest", "evening"]) {
    const row = page.getByTestId(`note-${type}`);
    if ((await row.getAttribute("data-on")) === "true") await tap(page, row.getByRole("switch"), 700);
  }
  await pause(page, 600);
  tl.cap("…and Home shows one line: you're not getting notifications");
  await open(page, "/");
  const bar = page.getByTestId("notify-status-bar");
  await bar.waitFor({ timeout: 10000 });
  await pointAt(page, bar);
  await pause(page, 2600);
  tl.cap("Tap it to go straight to the settings");
  await tap(page, bar, 2400);
  tl.stop();
  await pause(page, 1500);
  // Put Pia's notes back on (after the cut) for the other segments.
  for (const type of ["morning", "reminder", "harvest", "evening"]) {
    const row = page.getByTestId(`note-${type}`);
    if ((await row.getAttribute("data-on")) === "false") { await row.getByRole("switch").click(); await pause(page, 500); }
  }
});

// 3 ─ The 8 PM email, rendered by the real eveningEmail()
segment("03", "evening-email", "3 · The 8 PM email: tomorrow at a glance", { phone: true, mail: true }, async (page, tl) => {
  await page.goto(`file://${digestHtml}`, { waitUntil: "load" });
  await pause(page, 500);
  tl.cap("Tomorrow's practice, then every event in time order");
  await pointAt(page, page.getByText("Learn three neighbours", { exact: false }).locator("visible=true").first());
  await pause(page, 2600);
  tl.cap("Each event: a short preview, Details, and a one-tap RSVP");
  await glideBy(page, 260);
  await pointAt(page, page.getByText(/RSVP: I.m going/).locator("visible=true").first());
  tl.mark();
  await pause(page, 2600);
  tl.cap("Green \"RSVP'd\" for events you're already going to");
  await pointAt(page, page.getByText(/✓ RSVP.d/).locator("visible=true").first());
  await pause(page, 2600);
  tl.cap("Today's harvests, and a link to share yours");
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  await pause(page, 700);
  await pointAt(page, page.getByText("Share harvest").locator("visible=true").first());
  await pause(page, 2600);
  tl.cap("Footer: who it was sent to, settings, unsubscribe");
  await pointAt(page, page.getByText("Unsubscribe").locator("visible=true").last());
  await pause(page, 3000);
  tl.stop();
});

// 4 ─ Harvest ⋯ menu (phone, Pia, an event that ended earlier today)
segment("04", "harvest-menu", "4 · Harvest: ⋯ menu, then confirm before delete", { phone: true, session: "mock-peer", app: true }, async (page, tl) => {
  await open(page, `/events/${SCENE}/ev-ended1`);
  // Start with nothing shared, so the composer shows.
  const removed = await page.evaluate(async () => {
    const mine = await (await fetch("/api/harvests/mine")).json();
    const list = mine.harvests ?? mine.items ?? (Array.isArray(mine) ? mine : []);
    for (const h of list) await fetch(`/api/harvests/${h.id}`, { method: "DELETE" });
    return list.length;
  });
  if (removed) await open(page, `/events/${SCENE}/ev-ended1`);
  await page.getByTestId("harvest-composer").waitFor({ timeout: 10000 });
  tl.cap("After an event, share a harvest");
  await glide(page, page.getByTestId("harvest-composer"), 110);
  await type(page, page.locator("#hv-t"), "Cold and clear. I heard the creek differently after we stopped talking.", 22);
  await tap(page, page.getByTestId("harvest-share"), 300);
  await page.getByTestId("harvest-mine").waitFor({ timeout: 12000 });
  await glide(page, page.getByTestId("harvest-mine"), 140);
  tl.cap("Your harvest has a ⋯ menu");
  await tap(page, page.getByTestId("harvest-menu"), 300);
  await page.getByRole("menu").waitFor();
  tl.mark();
  await pause(page, 1800);
  tl.cap("Edit: change it and Save");
  await tap(page, page.getByTestId("harvest-menu-edit"), 500);
  await page.getByTestId("harvest-editor").waitFor();
  const t = page.locator("#hv-t");
  await pointAt(page, t);
  await t.press("End");
  await t.pressSequentially(" Thank you, Angelique.", { delay: 30 });
  await tap(page, page.getByTestId("harvest-save"), 300);
  await page.getByTestId("harvest-edited").waitFor({ timeout: 8000 }).catch(() => {});
  await pause(page, 1500);
  tl.cap("Delete asks first");
  await tap(page, page.getByTestId("harvest-menu"), 400);
  await tap(page, page.getByTestId("harvest-menu-delete"), 300);
  await page.getByRole("dialog").waitFor();
  await pause(page, 2400);
  tl.cap("Confirm, and it's gone");
  await tap(page, page.getByTestId("harvest-delete-yes"), 300);
  await page.getByTestId("harvest-composer").waitFor({ timeout: 10000 });
  await pause(page, 2000);
  tl.stop();
});

// 5 ─ The Home Screen invite (iPhone, signed in, not installed)
segment("05", "home-screen-invite", "5 · Signed in on a phone: invite to add COhere to the Home Screen", { phone: true, session: "mock-peer", invite: true }, async (page, tl) => {
  // Home: the invite waits for a page without a form, and Today carries the harvest card's.
  await page.goto("/", { waitUntil: "load" });
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 15000 });
  await pause(page, 500);
  tl.cap("Shown once to a signed-in phone visitor");
  await pause(page, 2600);
  tl.mark();
  tl.cap("iPhone: Share, then Add to Home Screen");
  await pointAt(page, dialog.getByText(/Share/).first());
  await pause(page, 2800);
  tl.cap("\"Not now\" closes it; it doesn't come back");
  await tap(page, dialog.getByRole("button", { name: /Not now/i }), 1500);
  tl.cap("The same steps stay on Me");
  await open(page, "/more");
  await pause(page, 2600);
  tl.stop();
});

// 6 ─ Board for a registered person (registered for 2026, not yet on the members roster)
segment("06", "board-registered", "6 · Board: a registered person signs in and gets in", { phone: true }, async (page, tl) => {
  await open(page, "/board");
  tl.cap("Signed out, the Board asks you to sign in");
  await pause(page, 1600);
  await tap(page, page.getByTestId("members-gate").getByRole("button", { name: /Sign in/i }), 800);
  const email = page.locator("#regenos-email-dialog");
  await email.waitFor({ timeout: 6000 });
  tl.cap("Sign in with the email you registered with");
  await type(page, email, "reg@cohere.test", 40);
  await tap(page, page.locator("form:has(#regenos-email-dialog) button[type=submit]"), 1600);
  tl.cap("(They tap the link in the email; that step is skipped here)");
  await pause(page, 2200);
  await page.context().addCookies([{ name: "__Host-rs_session", value: "sess-registrant", domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  tl.cap("Back on the Board: they're in. No \"Register\" loop");
  await page.goto("/board", { waitUntil: "load" });
  await page.getByTestId("board-empty").or(page.getByRole("button", { name: /write a post/i })).first().waitFor({ timeout: 20000 });
  await pause(page, 1200);
  tl.mark();
  await glideBy(page, 300);
  await pause(page, 2200);
  tl.stop();
});

// 7 ─ Calendar on a laptop (Pia)
segment("07", "calendar-laptop", "7 · Calendar on a laptop: pick a day, past days, All / My events", { session: "mock-peer" }, async (page, tl) => {
  await open(page, "/calendar");
  await page.getByTestId("calendar-week").waitFor({ timeout: 10000 });
  tl.cap("A laptop opens on the week");
  await pause(page, 1000);
  await glide(page, page.getByRole("listbox"), 70);
  await pause(page, 1400);
  tl.cap("Click a day: that day opens in Day view");
  await tap(page, page.getByRole("option", { name: /^\w+day Oct 18/ }), 300);
  await page.locator(".agenda-head h2", { hasText: "October 18" }).waitFor({ timeout: 6000 });
  await pause(page, 2400);
  tl.cap("Past days stay listed: Oct 15, the opening");
  await tap(page, page.getByRole("option", { name: /^\w+day Oct 15/ }), 300);
  await page.locator(".agenda-head h2", { hasText: "October 15" }).waitFor({ timeout: 6000 });
  await pause(page, 800);
  const card = page.getByTestId("event-card").filter({ hasText: "Opening Invocation" });
  tl.cap("Marked Ended, no RSVP; Harvests opens what people shared");
  await glide(page, card, 330);
  await pointAt(page, card.getByTestId("ev-ended"));
  tl.mark();
  await pause(page, 1600);
  await pointAt(page, card.getByTestId("card-harvests"));
  await pause(page, 1200);
  tl.cap("Harvests: what people shared after the opening");
  await tap(page, card.getByTestId("card-harvests"), 300);
  await page.getByTestId("harvest-section").waitFor({ timeout: 8000 });
  await pause(page, 800);
  await glide(page, page.getByTestId("harvest-section"), 90);
  await pause(page, 3000);
  await page.goBack();
  await page.getByRole("listbox").waitFor();
  await glide(page, page.getByRole("listbox"), 70);
  tl.cap("All events / My events: one switch over the same day");
  await tap(page, page.getByRole("option", { name: /^\w+day Oct 18/ }), 300);
  await page.locator(".agenda-head h2", { hasText: "October 18" }).waitFor({ timeout: 6000 });
  await pause(page, 1200);
  await tap(page, page.getByRole("button", { name: /^My events/ }), 2200);
  tl.cap("My events: only what you RSVP'd to");
  await pause(page, 1600);
  await tap(page, page.getByRole("button", { name: /^All events/ }), 2000);
  tl.stop();
});

// 8 ─ Sign-in box, and an event that has ended (phone, signed out)
segment("08", "signin-and-past-event", "8 · Sign-in box; an ended event drops Share and Add to calendar", { phone: true }, async (page, tl) => {
  await open(page, "/about");
  tl.cap("The sign-in box now wears the COhere look");
  await glide(page, page.locator(".foot__account button, .foot__account a"), 400);
  await tap(page, page.locator(".foot__account button, .foot__account a").first(), 300);
  await page.locator("#regenos-email-dialog").waitFor({ timeout: 6000 });
  tl.mark();
  await pause(page, 3000);
  await page.keyboard.press("Escape");
  tl.cap("An upcoming event: Share and Add to calendar");
  await open(page, `/events/${SCENE}/op-song`);
  await glide(page, page.getByRole("button", { name: /Share/ }).or(page.getByRole("link", { name: /Add to calendar/ })).first(), 260);
  await pause(page, 2600);
  tl.cap("An event that has ended: neither; harvests instead");
  await open(page, `/events/${SCENE}/op-opening`);
  await pause(page, 1500);
  await glide(page, page.getByTestId("harvest-section"), 220);
  await pause(page, 2400);
  tl.stop();
});

// 9 ─ The Spanish masthead at 1024
segment("09", "spanish-masthead", "9 · Spanish: the top bar fits at 1024 wide", { size: { width: 1024, height: CONTENT } }, async (page, tl) => {
  await open(page, "/");
  tl.cap("English at 1024 wide");
  await pause(page, 1800);
  tl.cap("Switch to Español: the top bar still fits on one line");
  await tap(page, page.getByRole("button", { name: "Español", exact: true }).locator("visible=true").first(), 300);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await pause(page, 600);
  await pointAt(page, page.locator("header").first());
  tl.mark();
  await pause(page, 2800);
  tl.cap("Same on the Calendar");
  await tap(page, page.locator("header").first().getByRole("link", { name: /Calendario/ }).first(), 2600);
  tl.stop();
});

// ── Record ──────────────────────────────────────────────────────────────────────────────────
if (!EDIT_ONLY) await seed().catch((e) => { console.error(`seed failed: ${e.message}`); process.exit(1); });
for (const s of SEGMENTS) {
  if (EDIT_ONLY || (ONLY && !ONLY.has(s.id))) continue;
  const before = problems.length;
  const vdir = `${RAW}/${s.id}`;
  await rm(vdir, { recursive: true, force: true });
  const context = await recorder(vdir, s.opts);
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`${s.id}: page error ${String(e).slice(0, 160)}`));
  const tl = timeline(page);
  try { await s.fn(page, tl); } catch (e) { problems.push(`${s.id}: step failed: ${String(e).split("\n")[0].slice(0, 220)}`); if (tl.end === null) tl.stop(); }
  await pause(page, 400);
  const closed = (Date.now() - tl.t0) / 1000;
  const video = page.video();
  await page.close();
  await context.close();
  await rename(await video.path(), `${vdir}/screen.webm`);
  await writeFile(`${vdir}/timeline.json`, JSON.stringify({ id: s.id, name: s.name, title: s.title, phone: Boolean(s.opts.phone), start: tl.start ?? 0, end: tl.end, closed, poster: tl.poster, steps: tl.steps }, null, 2));
  console.log(`recorded ${s.id} ${s.name}: ${(tl.end - (tl.start ?? 0)).toFixed(1)} s`);
  for (const p of problems.slice(before)) console.log(`  ! ${p}`);
}
await browser?.close();

// ── Edit ────────────────────────────────────────────────────────────────────────────────────
const ff = (args) => execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const assTime = (t) => { const cs = Math.max(0, Math.round(t * 100)); const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, s = Math.floor(cs / 100) % 60; return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };
const assText = (s) => s.replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");
function ass(title, steps, duration) {
  const lines = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Title,Noto Sans,31,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,7,34,34,12,1",
    "Style: Step,Noto Sans,27,&H0058B4ED,&H0058B4ED,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,34,34,54,1",
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    `Dialogue: 0,${assTime(0)},${assTime(duration)},Title,,0,0,0,,${assText(title)}`,
  ];
  steps.forEach((s, i) => {
    const end = i + 1 < steps.length ? steps[i + 1].t : duration;
    lines.push(`Dialogue: 0,${assTime(s.t)},${assTime(end)},Step,,0,0,0,,${assText(s.text)}`);
  });
  return lines.join("\n") + "\n";
}

const ENC = ["-c:v", "libx264", "-preset", "slow", "-crf", "25", "-tune", "stillimage", "-pix_fmt", "yuv420p", "-r", "30", "-g", "60", "-movflags", "+faststart", "-an"];
const segFiles = [];
for (const id of (await readdir(RAW)).filter((d) => /^\d\d$/.test(d)).sort()) {
  const dir = `${RAW}/${id}`;
  if (!existsSync(`${dir}/timeline.json`)) continue;
  const t = JSON.parse(await readFile(`${dir}/timeline.json`, "utf8"));
  // The recording starts at the first painted frame, not when the page opened (a slow first load can
  // take seconds), so line the caption clock up with the recording's end.
  const webm = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${dir}/screen.webm`]).toString());
  const lag = Math.max(0, (t.closed ?? t.end + 0.45) - webm);
  for (const k of ["start", "end", "poster"]) if (t[k] != null) t[k] = Math.max(0, t[k] - lag);
  t.steps = t.steps.map((s) => ({ ...s, t: Math.max(0, s.t - lag) }));
  const start = t.start, duration = Math.max(1, (t.end ?? start + 5) - start + 0.3);
  const steps = t.steps.map((s) => ({ ...s, t: Math.max(0, s.t - start) }));
  await writeFile(`${dir}/captions.ass`, ass(t.title, steps, duration));
  const fit = `scale=w=${W}:h=${CONTENT}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`;
  const file = `${out}/${id}-${t.name}.mp4`;
  ff(["-ss", start.toFixed(2), "-i", `${dir}/screen.webm`, "-t", duration.toFixed(2),
    "-vf", `${fit},pad=${W}:${H}:(ow-iw)/2:${BAND}:color=0x36558F,subtitles=${dir}/captions.ass`, ...ENC, file]);
  const posterAt = Math.max(0.5, Math.min(duration - 0.5, (t.poster ?? start + duration / 2) - start + 0.4));
  ff(["-ss", posterAt.toFixed(2), "-i", file, "-frames:v", "1", `${out}/${id}-${t.name}.png`]);
  segFiles.push({ id, file, title: t.title, duration });
}

// A short title card, then every segment, in order.
const card = `${RAW}/title.ass`;
await writeFile(card, [
  "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 2", "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Big,Noto Sans,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,60,60,0,1",
  "Style: Small,Noto Sans,30,&H0058B4ED,&H0058B4ED,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,60,60,0,1",
  "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "Dialogue: 0,0:00:00.00,0:00:03.00,Big,,0,0,0,,{\\pos(640,320)}What changed in the COhere app",
  "Dialogue: 0,0:00:00.00,0:00:03.00,Small,,0,0,0,,{\\pos(640,400)}October 16–17, 2026 · recorded on a local test copy, not the live site",
].join("\n") + "\n");
ff(["-f", "lavfi", "-i", `color=c=0x36558F:s=${W}x${H}:r=30:d=3`, "-vf", `subtitles=${card}`, ...ENC, `${RAW}/00-title.mp4`]);
const list = [`${RAW}/00-title.mp4`, ...segFiles.map((s) => s.file)].map((f) => `file '${process.cwd()}/${f}'`).join("\n");
await writeFile(`${RAW}/concat.txt`, list + "\n");
const tour = `${out}/cohere-changes-oct16-17.mp4`;
ff(["-f", "concat", "-safe", "0", "-i", `${RAW}/concat.txt`, "-c", "copy", "-movflags", "+faststart", tour]);

const probe = (f) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height", "-of", "json", f]).toString());
const p = probe(tour);
const seconds = Number(p.format.duration), mb = Number(p.format.size) / 1048576;
console.log(`\ntour: ${tour} — ${seconds.toFixed(1)} s, ${mb.toFixed(1)} MB, ${p.streams[0].codec_name} ${p.streams[0].width}×${p.streams[0].height}`);
for (const s of segFiles) console.log(`  ${s.file}: ${s.duration.toFixed(1)} s, ${((await stat(s.file)).size / 1048576).toFixed(2)} MB`);
if (seconds > 240) problems.push(`the tour runs ${seconds.toFixed(0)} s (over 4 minutes)`);
if (mb > 40) problems.push(`the tour is ${mb.toFixed(1)} MB (over 40 MB)`);
console.log(problems.length ? `\nchanges-video: ${problems.length} problem(s):\n${problems.map((x) => `  - ${x}`).join("\n")}` : "\nchanges-video: no problems");
process.exit(problems.length ? 1 : 0);
