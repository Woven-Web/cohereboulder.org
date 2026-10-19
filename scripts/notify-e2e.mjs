// End-to-end proof of notifications and Harvest in a real browser, against a
// local wrangler dev + the mock AppView (MOCK_NOTIFY=1) + the loopback push mock.
// Never touches scenius.social, a real push service or a real inbox: push goes
// to a loopback receiver that decrypts it, and the local send_email binding
// only writes files.
//
//   1. settings: signed out gets the gate; a signed-in person with no app sees "Not installed: we'll
//      email you", their account's verified address, and the email-only defaults (all three off)
//   2. with the app installed and a live subscription: push by default, all three on; switches and
//      channels persist across a reload
//   3. push breaks: the line says so, email takes over, "Turn push back on" lands a test push
//      (decrypted at the loopback receiver) and returns to push
//   4. the senders (scheduled(), fired at Boulder 6 AM / 8 PM / an hour after an event ends):
//      one push each, never repeated; a 404 from the push service expires the phone and the note
//      goes by email instead, once
//   5. emailed links with no sign-in: a plain GET changes nothing; the button unsubscribes;
//      Undo restores; the RFC 8058 one-click POST works; guest settings; the RSVP opt-in; a
//      forged link is refused
//   6. Harvest: the Today card, the composer, a photo, share / edit / delete, Report, a steward's
//      hide (gone for others, marked for the author), and members-only everywhere
//   7. Spanish, 390px and 360px phones with no sideways scroll, and no page errors throughout
//
// Usage (see scripts/ci-e2e.sh lane 13 for the exact servers and flags):
//   node scripts/notify-e2e.mjs <worker-url> <admin-session-token> <push-mock-url> <push-keys-file> \
//        [shots-dir]
//   with E2E_PERSIST_DIR (the worker's --persist-to dir, inside a /pwa-e2e- scratch dir) and
//   NOTIFY_LINK_SECRET (the worker's) set.

import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const [target, adminToken, pushOrigin, keysFile, shotsDir] = process.argv.slice(2);
/** Event-reminder screenshots (390 and 1280), when set. */
const reminderShots = process.env.REMINDER_SHOTS_DIR;
/** "Now on your phone. Want email too?" screenshots (390 and 1280), when set. */
const simpleShots = process.env.SIMPLE_SHOTS_DIR;
/** The emailed settings page (390 and 1280), when set. */
const onceShots = process.env.ONCE_SHOTS_DIR;
const persist = process.env.E2E_PERSIST_DIR;
const linkSecret = process.env.NOTIFY_LINK_SECRET;
if (!target || !adminToken || !pushOrigin || !keysFile || !persist || !linkSecret) {
  console.error("usage: E2E_PERSIST_DIR=… NOTIFY_LINK_SECRET=… node scripts/notify-e2e.mjs <worker> <admin-token> <push-mock> <keys-file> [shots-dir]");
  process.exit(2);
}
if (!persist.includes("/pwa-e2e-")) throw new Error("unique pwa scratch persistence required");
for (const url of [target, pushOrigin]) if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) throw new Error("loopback endpoints required");
if (shotsDir) mkdirSync(shotsDir, { recursive: true });

const keys = JSON.parse(readFileSync(keysFile, "utf8"));
const failures = [];
let step = "";
const ok = (m) => console.log(`ok    ${m}`);
const fail = (m) => { failures.push(`${step}: ${m}`); console.error(`FAIL  ${step}: ${m}`); };
const expect = (c, m) => (c ? ok(m) : fail(m));

const PEER = "did:plc:mockpeer"; // has a verified contact email at regenOS (pia@example.test)
const ME = "did:plc:mockuser"; // the default signed-in user: no contact email
const stamp = Date.now().toString(36);

// ------------------------------------------------------------------ helpers

const boulderDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const boulderClock = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const today = boulderDate(new Date());
const tomorrow = boulderDate(new Date(Date.now() + 86_400_000));
/** The UTC instant at which Boulder reads `date` `hh:mm`. */
function boulderInstant(date, hhmm) {
  const base = Date.parse(`${date}T00:00:00Z`);
  for (let hour = 0; hour < 36; hour++) {
    for (const min of [0]) {
      const t = base + hour * 3_600_000 + min * 60_000;
      if (boulderClock.format(new Date(t)).replace(",", "") === `${date} ${hhmm}`) return t;
    }
  }
  throw new Error(`could not place ${date} ${hhmm} in Boulder`);
}

function sql(query) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "cohere", "--local", "--persist-to", persist, "--json", "--command", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out)[0].results ?? [];
}
const sqlRun = (query) => { sql(query); };

const b64 = (buf) => Buffer.from(buf).toString("base64url");
/** The same signed link the Worker mints (worker/src/notify-core.ts): HMAC-SHA256 over the base64url payload. */
function link(payload, ttlSeconds = null) {
  const body = ttlSeconds === null ? payload : { ...payload, x: Math.floor(Date.now() / 1000) + ttlSeconds };
  const head = b64(JSON.stringify(body));
  return `${head}.${b64(createHmac("sha256", `cohere-notify-links-v1:${linkSecret}`).update(head).digest())}`;
}

async function api(path, { method = "GET", body, cookie, origin = true } = {}) {
  const res = await fetch(target + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: target } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const adminCookie = `cohere_session=${adminToken}`;
const sessionCookie = (name) => `__Host-rs_session=${name}`;
const pushMessages = async () => (await (await fetch(`${pushOrigin}/messages`)).json());

async function scheduleAt(instant) {
  const res = await fetch(`${target}/cdn-cgi/local/scheduled?cron=${encodeURIComponent("* * * * *")}&time=${instant}`);
  if (res.status !== 200) throw new Error(`scheduled answered ${res.status}`);
  return res;
}

const browser = await chromium.launch();
const pages = [];

/**
 * A browser as a person: signed in as `session` (a __Host-rs_session value), optionally with the
 * installed app (standalone display mode, notification permission granted, one push subscription).
 */
async function persona(session, { app = false, device = randomUUID(), endpoint = keys.endpoint, viewport = { width: 390, height: 844 }, look = null } = {}) {
  const context = await browser.newContext({ baseURL: target, viewport, serviceWorkers: "block" });
  await context.route("**/*", (route) => (new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort()));
  if (session) await context.addCookies([{ name: "__Host-rs_session", value: session, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" }]);
  await context.addInitScript(({ device, app, endpoint, keys, look }) => {
    try {
      localStorage.setItem("cohere-companion-device", device);
      if (look) localStorage.setItem("cohere-look", look);
    } catch { return; } // an opaque-origin frame (a blocked embed) has no storage
    if (!app) return;
    localStorage.setItem("cohere-push-off", "false");
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => (query === "(display-mode: standalone)" ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : original(query));
    const sub = { toJSON: () => ({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }), unsubscribe: async () => true };
    Object.defineProperty(window, "PushManager", { value: class {} });
    Object.defineProperty(Notification, "permission", { get: () => "granted" });
    Notification.requestPermission = async () => "granted";
    const registration = { pushManager: { getSubscription: async () => sub, subscribe: async () => sub } };
    Object.defineProperty(navigator.serviceWorker, "ready", { value: Promise.resolve(registration) });
    navigator.serviceWorker.getRegistration = async () => registration;
  }, { device, app, endpoint, keys, look });
  const page = await context.newPage();
  page.on("pageerror", (e) => fail(`uncaught page error — ${e}`));
  pages.push(page);
  return { context, page, device, cookie: session ? sessionCookie(session) : null };
}

async function register(device, endpoint = keys.endpoint) {
  const res = await api("/api/companion/subscriptions", { method: "POST", body: { device_id: device, endpoint, p256dh: keys.p256dh, auth: keys.auth, language: "en" } });
  if (res.status !== 200) throw new Error(`subscriptions answered ${res.status}`);
}

const noSideways = (page, label) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > width + 1).slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
    return { fits: document.documentElement.scrollWidth <= width + 1, wide, scroll: document.documentElement.scrollWidth, width };
  }).then(({ fits, wide, scroll, width }) => expect(fits, `no sideways scroll: ${label}${fits ? "" : ` (${scroll} > ${width}: ${wide.join(", ")})`}`));
const shot = async (page, name) => { if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: true }); };
const note = (page, type) => page.getByTestId(`note-${type}`);
const reachText = (page) => page.getByTestId("notify-reach").innerText();

try {
  // The people and the day's content the senders need.
  await api("/api/admin/companion/content", {
    method: "PUT", cookie: adminCookie,
    body: { type: "daily", date: today, title: "Learn three neighbours’ names", body: "Learn the names of three neighbours. Say them out loud twice.", question: "Who lives within a minute of you?", title_es: "Aprende tres nombres", body_es: "Aprende los nombres de tres vecinos.", question_es: "¿Quién vive cerca de ti?" },
  });

  // ── 1. Settings, signed out and signed in without the app ────────────────────
  step = "settings: no app";
  const anon = await persona(null);
  await anon.page.goto("/more/notifications", { waitUntil: "networkidle" });
  await anon.page.getByTestId("notify-signed-out").waitFor({ timeout: 15_000 });
  expect(!(await anon.page.getByTestId("notify-reach").count()), "signed out: the gate, not settings");
  expect((await api("/api/notify/settings")).status === 401, "the settings API refuses a signed-out caller");

  const peer = await persona("mock-peer");
  await peer.page.goto("/more/notifications", { waitUntil: "networkidle" });
  await peer.page.getByTestId("notify-reach").waitFor({ timeout: 15_000 });
  let reach = await reachText(peer.page);
  expect(reach.includes("Not installed: we’ll email you"), `no app: 'Not installed: we’ll email you' — got ${JSON.stringify(reach)}`);
  expect(reach.includes("pia@example.test"), "the account's verified address (from regenOS) is the email on file");
  for (const type of ["morning", "harvest", "evening"]) {
    expect((await note(peer.page, type).getAttribute("data-on")) === "false", `email-only: ${type} is off by default`);
  }
  await note(peer.page, "morning").getByRole("switch").click();
  await peer.page.waitForFunction(() => document.querySelector('[data-testid="note-morning"]')?.getAttribute("data-on") === "true");
  expect(await note(peer.page, "morning").getByRole("button", { name: "Phone", exact: true }).isDisabled(), "Push is greyed out without the app");
  expect((await note(peer.page, "morning").innerText()).includes("Push needs the app on this phone"), "…and says why");
  await shot(peer.page, "notify-settings-notinstalled-390x844");
  await noSideways(peer.page, "settings, no app");
  await peer.page.reload({ waitUntil: "networkidle" });
  await peer.page.getByTestId("notify-reach").waitFor();
  expect((await note(peer.page, "morning").getAttribute("data-on")) === "true", "the morning switch persisted across a reload");
  await note(peer.page, "morning").getByRole("switch").click();
  await peer.page.waitForFunction(() => document.querySelector('[data-testid="note-morning"]')?.getAttribute("data-on") === "false");

  // A person with no address anywhere: "Nothing can reach you yet".
  const me0 = await persona("sess-1");
  await me0.page.goto("/more/notifications", { waitUntil: "networkidle" });
  await me0.page.getByTestId("notify-reach").waitFor({ timeout: 15_000 });
  expect((await reachText(me0.page)).includes("Nothing can reach you yet."), "no app and no address: 'Nothing can reach you yet.'");
  await me0.page.getByLabel("Email address").fill("not-an-email");
  await me0.page.getByRole("button", { name: "Send me a confirmation link" }).click();
  expect(await me0.page.locator("#em-f.has-error").count() === 1, "a bad address is refused in the form");
  await me0.page.getByLabel("Email address").fill(`sam-${stamp}@example.org`);
  await me0.page.getByRole("button", { name: "Send me a confirmation link" }).click();
  await me0.page.getByRole("status").filter({ hasText: /Link sent|isn’t set up/ }).waitFor({ timeout: 10_000 });
  expect(sql(`SELECT * FROM notify_prefs WHERE email = 'sam-${stamp}@example.org'`).length === 0, "nothing changes until the emailed link is tapped");
  await shot(me0.page, "notify-settings-noemail-390x844");

  // ── 2. With the app installed ────────────────────────────────────────────────
  step = "settings: app installed";
  sqlRun(`DELETE FROM notify_prefs WHERE person_key = '${PEER}'`); // back to the defaults (the address is re-read from regenOS)
  const installed = await persona("mock-peer", { app: true });
  await register(installed.device);
  await installed.page.goto("/more/notifications", { waitUntil: "networkidle" });
  await installed.page.getByTestId("notify-reach").waitFor({ timeout: 15_000 });
  await installed.page.waitForFunction(() => document.querySelector('[data-testid="notify-reach"]')?.textContent?.includes("notifications on"), null, { timeout: 15_000 });
  reach = await reachText(installed.page);
  expect(reach.includes("This phone: app installed · notifications on"), "installed + live: 'This phone: app installed · notifications on'");
  for (const type of ["morning", "harvest", "evening"]) {
    expect((await note(installed.page, type).getAttribute("data-on")) === "true" && (await note(installed.page, type).getAttribute("data-channel")) === "push", `installed: ${type} is on, by push`);
  }
  expect((await note(installed.page, "harvest").innerText()).includes("Push, because the app is installed"), "…with the plain reason");
  const row = sql(`SELECT person_key, installed, state FROM notify_devices WHERE device_id = '${installed.device}'`)[0];
  expect(row?.person_key === PEER && row.installed === 1 && row.state === "live", "the phone is linked to the account, installed and live");
  await shot(installed.page, "notify-settings-390x844");
  await noSideways(installed.page, "settings, installed");

  // The phone took every note by default: one quiet line offers email too, one tap adds it.
  const emailToo = installed.page.getByTestId("notify-email-too");
  expect((await emailToo.innerText()).includes("Now on your phone. Want email too?"), "live phone, no choices made: 'Now on your phone. Want email too?'");
  if (simpleShots) {
    await installed.page.screenshot({ path: `${simpleShots}/email-too-390.png`, fullPage: true });
    const wideNow = await persona("mock-peer", { app: true, device: installed.device, viewport: { width: 1280, height: 900 } });
    await wideNow.page.goto("/more/notifications", { waitUntil: "networkidle" });
    await wideNow.page.getByTestId("notify-email-too").waitFor({ timeout: 15_000 });
    await wideNow.page.screenshot({ path: `${simpleShots}/email-too-1280.png`, fullPage: true });
    await wideNow.context.close();
  }
  await emailToo.getByRole("button", { name: "Add email", exact: true }).click();
  await installed.page.waitForFunction(() => document.querySelector('[data-testid="evening-email"]')?.getAttribute("aria-pressed") === "true");
  for (const type of ["morning", "reminder", "harvest", "evening"]) {
    const both = (await note(installed.page, type).getByRole("button", { name: "Phone", exact: true }).getAttribute("aria-pressed")) === "true"
      && (await note(installed.page, type).getByRole("button", { name: "Email", exact: true }).getAttribute("aria-pressed")) === "true";
    expect(both, `'Add email': ${type} now goes by phone and email`);
  }
  expect(!(await emailToo.count()), "the line goes once the choice is made");
  if (simpleShots) await installed.page.screenshot({ path: `${simpleShots}/email-too-added-390.png`, fullPage: true });
  sqlRun(`DELETE FROM notify_prefs WHERE person_key = '${PEER}'`); // back to the defaults for what follows
  await installed.page.reload({ waitUntil: "networkidle" });
  await installed.page.getByTestId("notify-email-too").waitFor({ timeout: 15_000 });

  // Phone and Email are two toggles: Email on top of Phone is "both", then switching Phone off leaves email only.
  const pressed = (type, which) => note(installed.page, type).getByRole("button", { name: which, exact: true }).getAttribute("aria-pressed");
  await note(installed.page, "harvest").getByRole("button", { name: "Email", exact: true }).click();
  await installed.page.waitForFunction(() => document.querySelector('[data-testid="harvest-email"]')?.getAttribute("aria-pressed") === "true");
  expect((await pressed("harvest", "Phone")) === "true" && (await pressed("harvest", "Email")) === "true", "Email on top of Phone is both");
  expect(sql(`SELECT also_email FROM notify_prefs WHERE person_key = '${PEER}'`)[0]?.also_email === "harvest", "both is stored as harvest in also_email");
  await note(installed.page, "harvest").getByRole("button", { name: "Phone", exact: true }).click();
  await installed.page.waitForFunction(() => document.querySelector('[data-testid="note-harvest"]')?.getAttribute("data-channel") === "email");
  expect((await pressed("harvest", "Phone")) === "false" && (await pressed("harvest", "Email")) === "true", "switching Phone off leaves email only");
  expect((await note(installed.page, "harvest").innerText()).includes("You chose this."), "choosing Email says 'You chose this.'");
  await note(installed.page, "evening").getByRole("switch").click();
  await installed.page.waitForFunction(() => document.querySelector('[data-testid="note-evening"]')?.getAttribute("data-on") === "false");
  await installed.page.reload({ waitUntil: "networkidle" });
  await installed.page.getByTestId("notify-reach").waitFor();
  expect((await note(installed.page, "harvest").getAttribute("data-channel")) === "email" && (await note(installed.page, "evening").getAttribute("data-on")) === "false", "the channel and the switch persisted");
  await note(installed.page, "evening").getByRole("switch").click(); // back on
  await note(installed.page, "harvest").getByRole("button", { name: "Phone", exact: true }).click(); // both
  await note(installed.page, "harvest").getByRole("button", { name: "Email", exact: true }).click(); // phone only
  await installed.page.waitForFunction(() => document.querySelector('[data-testid="note-harvest"]')?.getAttribute("data-channel") === "push" && document.querySelector('[data-testid="harvest-email"]')?.getAttribute("aria-pressed") === "false");

  // ── 3. Push breaks, and comes back ───────────────────────────────────────────
  step = "push breaks";
  sqlRun(`UPDATE notify_devices SET state = 'suspect', fail_count = 3 WHERE device_id = '${installed.device}'`);
  await installed.page.reload({ waitUntil: "networkidle" });
  await installed.page.getByTestId("notify-reach").waitFor();
  reach = await reachText(installed.page);
  expect(reach.includes("Push stopped working on this phone. We switched you to email."), "broken: the line says push stopped and we switched to email");
  expect(await installed.page.getByTestId("turn-push-back-on").isVisible(), "…with 'Turn push back on'");
  expect((await note(installed.page, "morning").getAttribute("data-channel")) === "email", "the effective channel is email while the stored choice stays push");
  expect(await note(installed.page, "morning").getByRole("button", { name: "Phone", exact: true }).isDisabled(), "Push is greyed out while broken");
  await shot(installed.page, "notify-settings-pushfailed-390x844");
  const before = (await pushMessages()).messages.length;
  await installed.page.getByTestId("turn-push-back-on").click();
  await installed.page.waitForFunction(() => document.querySelector('[data-testid="notify-reach"]')?.textContent?.includes("notifications on"), null, { timeout: 15_000 });
  const after = await pushMessages();
  expect(after.messages.length === before + 1 && after.messages.at(-1).title === "Push is working" && after.messages.at(-1).device === installed.device, "'Turn push back on' landed a test push, decrypted at the receiver");
  expect(after.errors.length === 0, "the receiver saw no bad push");
  expect(sql(`SELECT state, fail_count FROM notify_devices WHERE device_id = '${installed.device}'`)[0]?.state === "live", "the phone is live again");
  expect((await note(installed.page, "morning").getAttribute("data-channel")) === "push", "…and push is the channel again, with no choice rewritten");

  // ── 4. The senders ───────────────────────────────────────────────────────────
  step = "senders";
  // Peer is the live phone; ME gets an app with a phone the push service says is gone (404).
  const gone = await persona("sess-1", { app: true, endpoint: `${pushOrigin}/push-gone` });
  await register(gone.device, `${pushOrigin}/push-gone`);
  await gone.page.goto("/more/notifications", { waitUntil: "networkidle" });
  await gone.page.getByTestId("notify-reach").waitFor({ timeout: 15_000 });
  await gone.page.waitForFunction(() => document.querySelector('[data-testid="notify-reach"]')?.textContent?.includes("notifications on"), null, { timeout: 15_000 });
  sqlRun(`INSERT INTO notify_prefs (person_key, did, email, email_verified_at, locale, created_at, updated_at) VALUES ('${ME}', '${ME}', 'sam-${stamp}@example.org', '2026-10-01T00:00:00Z', 'en', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z') ON CONFLICT(person_key) DO UPDATE SET email = excluded.email, email_verified_at = excluded.email_verified_at`);

  const sixAm = boulderInstant(today, "06:00");
  await Promise.all([scheduleAt(sixAm), scheduleAt(sixAm)]);
  await scheduleAt(sixAm + 60_000);
  let { messages } = await pushMessages();
  const morning = messages.filter((m) => m.tag === `${today}-morning`);
  expect(morning.length === 1 && morning[0].device === installed.device, "one morning push, to the phone that is live, once however many ticks");
  expect(/ · Learn three neighbours’ names$/.test(morning[0].title) && morning[0].body.startsWith("Learn the names of three neighbours. Then ask: Who lives within a minute of you?"), "the practice and its question are one note");
  expect(morning[0].url === "/today" && morning[0].actions?.length === 2, "it opens Today, with Open and Settings actions");
  let ledger = sql("SELECT person_key, channel, fell_back, status FROM notify_ledger WHERE type = 'morning' ORDER BY person_key");
  const mine = ledger.find((r) => r.person_key === ME), pia = ledger.find((r) => r.person_key === PEER);
  expect(pia?.channel === "push" && pia.status === "sent", "the live phone's person was sent by push");
  expect(mine?.channel === "email" && mine.fell_back === 1 && mine.status === "sent", "the 404'd phone's person was sent by email instead (a fallback), exactly once");
  expect(sql(`SELECT state FROM notify_devices WHERE device_id = '${gone.device}'`)[0]?.state === "expired", "a 404 from the push service expired that phone");
  expect(sql(`SELECT COUNT(*) AS n FROM companion_subscriptions WHERE device_id = '${gone.device}'`)[0].n === 0, "…and its subscription was dropped, never retried");
  await gone.page.reload({ waitUntil: "networkidle" });
  await gone.page.getByTestId("notify-reach").waitFor();
  expect((await reachText(gone.page)).includes("Push stopped working on this phone. We switched you to email."), "settings tells that person push stopped and email took over");
  await shot(gone.page, "notify-settings-pushfailed-fellback-390x844");

  // 8 PM: tomorrow's events (one is created here through the admin API).
  const made = await api("/api/admin/events", { method: "POST", cookie: adminCookie, body: { name: "Tomorrow Supper", startsAt: `${tomorrow}T17:00:00Z`, endsAt: `${tomorrow}T19:00:00Z`, placeName: "Mock Hall" } });
  expect(made.status === 200, "a tomorrow event exists for the 8 PM note");
  await scheduleAt(boulderInstant(today, "20:00"));
  ({ messages } = await pushMessages());
  const evening = messages.filter((m) => m.url === "/tomorrow");
  expect(evening.length === 1 && evening[0].title === "Ready for tomorrow?" && /1 event · /.test(evening[0].body), "one 8 PM push for the live phone, listing tomorrow");
  await scheduleAt(boulderInstant(today, "20:00") + 120_000);
  expect((await pushMessages()).messages.filter((m) => m.url === "/tomorrow").length === 1, "…and not again on a later tick");

  // The harvest invitation: an hour after "Honoring Water" ended (it ended 90 minutes ago).
  const nowFive = Math.floor(Date.now() / 300_000) * 300_000;
  await scheduleAt(nowFive);
  ({ messages } = await pushMessages());
  const invite = messages.filter((m) => m.title === "How was Honoring Water?");
  expect(invite.length === 1 && invite[0].url.endsWith("/ev-ended1"), "one harvest invitation, for the event, to the person who RSVP'd with a live phone");
  await scheduleAt(nowFive + 300_000);
  expect((await pushMessages()).messages.filter((m) => m.title === "How was Honoring Water?").length === 1, "…not repeated");
  expect((await pushMessages()).errors.length === 0, "no bad push anywhere");

  // ── 4b. Event reminders ──────────────────────────────────────────────────────
  step = "event reminders";
  const reminderShot = async (page, name) => { if (reminderShots) await page.screenshot({ path: `${reminderShots}/${name}.png`, fullPage: true }); };
  // The settings row: on by push for the live phone, in its own row between the morning note and the harvest invitation.
  await installed.page.reload({ waitUntil: "networkidle" });
  await installed.page.getByTestId("notify-reach").waitFor();
  const reminderRow = note(installed.page, "reminder");
  expect((await reminderRow.getAttribute("data-on")) === "true" && (await reminderRow.getAttribute("data-channel")) === "push", "the live phone: Event reminders on, by push, without touching anything");
  const rowText = await reminderRow.innerText();
  expect(rowText.includes("Event reminders") && rowText.includes("1 hour before an event starts"), "the row says what it is and when it comes");
  const order = await installed.page.$$eval('[data-testid^="note-"]', (els) => els.map((el) => el.getAttribute("data-testid")));
  expect(JSON.stringify(order) === JSON.stringify(["note-morning", "note-reminder", "note-harvest", "note-evening"]), `four rows, in the day's order — got ${order}`);
  await reminderShot(installed.page, "reminders-settings-app-390");
  await noSideways(installed.page, "settings with reminders");
  const wide = await persona("mock-peer", { app: true, device: installed.device, viewport: { width: 1280, height: 900 } });
  await wide.page.goto("/more/notifications", { waitUntil: "networkidle" });
  await note(wide.page, "reminder").waitFor({ timeout: 15_000 });
  await reminderShot(wide.page, "reminders-settings-app-1280");
  await wide.context.close();
  const ecoWide = await persona("mock-peer", { app: true, device: installed.device, viewport: { width: 1280, height: 900 }, look: "ecology" });
  await ecoWide.page.goto("/more/notifications?look=ecology", { waitUntil: "networkidle" });
  await note(ecoWide.page, "reminder").waitFor({ timeout: 15_000 });
  expect((await note(ecoWide.page, "reminder").innerText()).includes("1 hour before"), "ecology look: the short label");
  await reminderShot(ecoWide.page, "reminders-settings-ecology-1280");
  await ecoWide.context.close();

  // A phone that stopped working: reminders stay off email until the person asks for email.
  await gone.page.reload({ waitUntil: "networkidle" });
  await gone.page.getByTestId("notify-reach").waitFor();
  const goneRow = note(gone.page, "reminder");
  expect((await goneRow.getByRole("button", { name: "Email", exact: true }).getAttribute("aria-pressed")) === "false", "push gone: reminders do not quietly move to email");
  expect((await goneRow.innerText()).includes("Reminders go to the app on your phone. Tap Email to get them by email instead."), "…and the row says how to get them by email");
  await reminderShot(gone.page, "reminders-settings-nopush-390");
  await goneRow.getByRole("button", { name: "Email", exact: true }).click();
  await gone.page.waitForFunction(() => document.querySelector('[data-testid="reminder-email"]')?.getAttribute("aria-pressed") === "true");
  const stored = sql(`SELECT reminder_on, reminder_channel FROM notify_prefs WHERE person_key = '${ME}'`)[0];
  expect(stored?.reminder_on === 1 && stored.reminder_channel === "email", "tapping Email stores an explicit email choice");
  await reminderShot(gone.page, "reminders-settings-email-390");

  // The sender: an event tomorrow at 2:02 PM Boulder; the 1:00 PM scan is 62 minutes before it.
  const scan = boulderInstant(tomorrow, "13:00");
  const startsAt = new Date(scan + 62 * 60_000).toISOString();
  const tea = await api("/api/admin/events", { method: "POST", cookie: adminCookie, body: { name: "Reminder Tea", startsAt, endsAt: new Date(scan + 122 * 60_000).toISOString(), placeName: "Mock Hall" } });
  expect(tea.status === 200 && tea.json?.rkey, "an event to be reminded of exists");
  for (const who of [installed, gone]) {
    const state = await who.page.evaluate(async ({ did, rkey }) => {
      const res = await fetch("/xrpc/social.scenius.rsvp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventDid: did, eventRkey: rkey, intent: "going", attendance: "open", audience: "public" }) });
      return (await res.json()).state;
    }, { did: tea.json.did, rkey: tea.json.rkey });
    expect(state === "confirmed", "RSVP'd through the proxy");
  }
  await scheduleAt(scan - 10 * 60_000); // 72 minutes before: too early
  expect(!(await pushMessages()).messages.some((m) => m.title === "Reminder Tea"), "nothing 72 minutes before");
  await Promise.all([scheduleAt(scan), scheduleAt(scan)]);
  await scheduleAt(scan + 5 * 60_000);
  ({ messages } = await pushMessages());
  const reminders = messages.filter((m) => m.title === "Reminder Tea");
  expect(reminders.length === 1 && reminders[0].device === installed.device, "one reminder push, to the live phone, however many ticks");
  expect(reminders[0]?.body === "Starts at 2:02 PM · Mock Hall" && reminders[0]?.url === `/events/${encodeURIComponent(tea.json.did)}/${tea.json.rkey}`, `title, 'Starts at 2:02 PM · Mock Hall', and the event link — got ${JSON.stringify(reminders[0])}`);
  const rl = sql(`SELECT person_key, channel, status FROM notify_reminder_ledger WHERE ref = '${tea.json.did}/${tea.json.rkey}' ORDER BY person_key`);
  const peerRow = rl.find((r) => r.person_key === PEER), meRow = rl.find((r) => r.person_key === ME);
  expect(peerRow?.channel === "push" && peerRow.status === "sent", "ledger: the live phone's person, sent by push");
  expect(meRow?.channel === "email", `ledger: the person who chose email, by email — got ${JSON.stringify(meRow)}`);
  expect(sql(`SELECT COUNT(*) AS n FROM notify_ledger WHERE ref = '${tea.json.did}/${tea.json.rkey}'`)[0].n === 0, "the other notes' ledger is untouched");

  // ── 5. Emailed links ─────────────────────────────────────────────────────────
  step = "emailed links";
  const sam = `mailto:sam-${stamp}@example.org`;
  sqlRun(`INSERT INTO notify_prefs (person_key, email, email_verified_at, morning_on, locale, created_at, updated_at) VALUES ('${sam}', 'sam-${stamp}@example.org', '2026-10-01T00:00:00Z', 1, 'en', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`);
  const unsub = link({ p: sam, k: "unsub", t: "morning" });
  const guest = await persona(null);
  await guest.page.goto(`/n/${unsub}`, { waitUntil: "networkidle" });
  await guest.page.getByTestId("link-unsub").waitFor({ timeout: 15_000 });
  expect((await guest.page.getByTestId("link-title").innerText()).startsWith("Turn off “Morning note”?"), "the unsubscribe page asks first");
  expect(sql(`SELECT morning_on FROM notify_prefs WHERE person_key = '${sam}'`)[0].morning_on === 1, "opening the link changed nothing");
  await shot(guest.page, "notify-unsub-390x844");
  await guest.page.getByTestId("link-confirm").click();
  await guest.page.getByTestId("link-unsub").and(guest.page.locator('[data-done="true"]')).waitFor();
  expect(sql(`SELECT morning_on FROM notify_prefs WHERE person_key = '${sam}'`)[0].morning_on === 0, "the button turned that one note off");
  await shot(guest.page, "notify-unsub-done-390x844");
  await guest.page.getByTestId("link-undo").click();
  await guest.page.getByText("It’s back on.").waitFor();
  expect(sql(`SELECT morning_on FROM notify_prefs WHERE person_key = '${sam}'`)[0].morning_on === 1, "Undo put it back exactly as it was");
  const oneClick = await fetch(`${target}/n/${unsub}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
  expect(oneClick.status === 200 && sql(`SELECT morning_on FROM notify_prefs WHERE person_key = '${sam}'`)[0].morning_on === 0, "the RFC 8058 one-click POST unsubscribes without a page");
  const plain = await fetch(`${target}/n/${link({ p: sam, k: "unsub", t: "harvest" })}`);
  expect(plain.status === 200 && sql(`SELECT harvest_on FROM notify_prefs WHERE person_key = '${sam}'`)[0].harvest_on === null, "a plain GET (a mail scanner) unsubscribes nothing");

  const guestSettings = await persona(null);
  const settingsLink = link({ p: sam, k: "settings" }, 3600);
  await guestSettings.page.goto(`/n/${settingsLink}`, { waitUntil: "networkidle" });
  const emailPage = guestSettings.page.getByTestId("email-settings");
  await emailPage.waitFor({ timeout: 15_000 });
  expect((await emailPage.innerText()).includes(`sam-${stamp}@example.org`), "the emailed settings page is for that address");
  expect(sql(`SELECT evening_on, morning_on FROM notify_prefs WHERE person_key = '${sam}'`)[0].evening_on === null, "opening the settings link changed nothing");
  expect(!(await guestSettings.page.getByRole("switch").count()) && !(await guestSettings.page.getByRole("button", { name: "Phone", exact: true }).count()), "no phone controls from an email link");
  const emailRow = (type) => guestSettings.page.getByTestId(`email-${type}`);
  const isOn = (type) => guestSettings.page.waitForFunction((t) => document.querySelector(`[data-testid="email-${t}"]`)?.getAttribute("data-on"), type).then((h) => h.jsonValue());
  expect(await emailRow("evening").getAttribute("data-on") === "false" && await emailRow("morning").getAttribute("data-on") === "false", "both start off for an address that never opted in");
  await guestSettings.page.getByTestId("email-evening-toggle").click();
  await guestSettings.page.waitForFunction(() => document.querySelector('[data-testid="email-evening"]')?.getAttribute("data-on") === "true");
  expect(sql(`SELECT evening_on, evening_channel FROM notify_prefs WHERE person_key = '${sam}'`)[0].evening_channel === "email", "Turn it on: the 8 PM note by email, no sign-in");
  if (onceShots) {
    // How a registrant who changed nothing sees it: the 8 PM email on, the morning one off. Tall enough that the tab bar covers nothing.
    await guestSettings.page.setViewportSize({ width: 390, height: 1100 });
    await guestSettings.page.screenshot({ path: `${onceShots}/settings-from-email-390.png`, fullPage: true });
    await guestSettings.page.setViewportSize({ width: 390, height: 844 });
    const wideSettings = await persona(null, { viewport: { width: 1280, height: 1000 } });
    await wideSettings.page.goto(`/n/${settingsLink}`, { waitUntil: "networkidle" });
    await wideSettings.page.getByTestId("email-settings").waitFor({ timeout: 15_000 });
    await wideSettings.page.screenshot({ path: `${onceShots}/settings-from-email-1280.png`, fullPage: true });
    await wideSettings.context.close();
  }
  await guestSettings.page.getByTestId("email-morning-toggle").click();
  await guestSettings.page.waitForFunction(() => document.querySelector('[data-testid="email-morning"]')?.getAttribute("data-on") === "true");
  expect(sql(`SELECT morning_on FROM notify_prefs WHERE person_key = '${sam}'`)[0].morning_on === 1, "Turn it on: the morning note by email");
  expect((await guestSettings.page.getByTestId("email-settings-more").getByRole("link").getAttribute("href")) === "/login?returnTo=/more/notifications", "'Sign in for more' goes to sign-in, then settings");
  await guestSettings.page.reload({ waitUntil: "networkidle" });
  await emailPage.waitFor();
  expect(await isOn("evening") === "true" && await isOn("morning") === "true", "the choices are still there after a reload");
  await noSideways(guestSettings.page, "emailed settings page");
  await guestSettings.page.getByTestId("email-evening-toggle").click();
  await guestSettings.page.waitForFunction(() => document.querySelector('[data-testid="email-evening"]')?.getAttribute("data-on") === "false");
  expect(sql(`SELECT evening_on FROM notify_prefs WHERE person_key = '${sam}'`)[0].evening_on === 0, "Turn it off: the 8 PM note stops");
  if (onceShots) {
    await guestSettings.page.setViewportSize({ width: 390, height: 1100 });
    await guestSettings.page.screenshot({ path: `${onceShots}/settings-from-email-evening-off-390.png`, fullPage: true });
  }
  await shot(guestSettings.page, "notify-settings-guest-390x844");

  const optin = await persona(null);
  const lonely = `mailto:opt-${stamp}@example.org`;
  await optin.page.goto(`/n/${link({ p: lonely, k: "optin" }, 3600)}`, { waitUntil: "networkidle" });
  await optin.page.getByTestId("link-optin").waitFor({ timeout: 15_000 });
  expect(sql(`SELECT * FROM notify_prefs WHERE person_key = '${lonely}'`).length === 0, "the RSVP opt-in page changes nothing on load");
  await optin.page.getByTestId("link-confirm").click();
  await optin.page.getByTestId("link-optin").and(optin.page.locator('[data-done="true"]')).waitFor();
  expect(sql(`SELECT email_optin_at IS NOT NULL AS yes, morning_on FROM notify_prefs WHERE person_key = '${lonely}'`)[0]?.yes === 1, "one tap opts the address into the harvest and 8 PM notes");

  // The 8 PM email's one-tap RSVP: the page gives the time, and after the press still names the event and links to it.
  const rsvper = await persona(null);
  await rsvper.page.goto(`/n/${link({ p: `mailto:rsvp-${stamp}@example.org`, k: "rsvp", d: "did:plc:mockscene", r: "ev-seed1" }, 3600)}`, { waitUntil: "networkidle" });
  await rsvper.page.getByTestId("link-rsvp").waitFor({ timeout: 15_000 });
  expect(/\d:\d\d [AP]M/.test(await rsvper.page.getByTestId("link-rsvp").innerText()), "the RSVP link page gives the start time, as the email does");
  await rsvper.page.getByTestId("link-confirm").click();
  await rsvper.page.getByTestId("link-rsvp").and(rsvper.page.locator('[data-done="true"]')).waitFor();
  expect((await rsvper.page.getByTestId("link-rsvp").innerText()).includes("Seed Gathering"), "after the RSVP, the page still names the event");
  expect((await rsvper.page.getByTestId("link-rsvp").getByRole("link").getAttribute("href")) === `/events/${encodeURIComponent("did:plc:mockscene")}/ev-seed1`, "after the RSVP, Details opens the event");

  // Someone whose emails are in Spanish lands on a Spanish page.
  const ana = `mailto:ana-${stamp}@example.org`;
  sqlRun(`INSERT INTO notify_prefs (person_key, email, locale, created_at, updated_at) VALUES ('${ana}', 'ana-${stamp}@example.org', 'es', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`);
  const spanish = await persona(null);
  await spanish.page.goto(`/n/${link({ p: ana, k: "settings" }, 3600)}`, { waitUntil: "networkidle" });
  await spanish.page.getByTestId("email-settings").waitFor({ timeout: 15_000 });
  expect((await spanish.page.locator("h1").first().innerText()) === "Avisos", "an emailed link opens in the language of the email");

  const forged = await persona(null);
  await forged.page.goto(`/n/${unsub.slice(0, -3)}abc`, { waitUntil: "networkidle" });
  await forged.page.getByTestId("link-invalid").waitFor({ timeout: 15_000 });
  ok("a forged link is refused");

  // ── 6. Harvest ───────────────────────────────────────────────────────────────
  step = "harvest";
  const eventHref = `/events/${encodeURIComponent("did:plc:mockscene")}/ev-ended1`;
  const author = await persona("sess-1");
  await author.page.goto("/today", { waitUntil: "networkidle" });
  const card = author.page.getByTestId("harvest-card");
  await card.waitFor({ timeout: 20_000 });
  expect((await card.innerText()).includes("Honoring Water"), "Today: the card names the event you went to");
  await shot(author.page, "harvest-today-390x844");
  await noSideways(author.page, "Today with the harvest card");
  await author.page.getByTestId("harvest-card-share").click();
  await author.page.getByTestId("harvest-composer").waitFor({ timeout: 15_000 });
  expect(author.page.url().includes("ev-ended1"), "the card opens the event page with the composer");
  expect((await author.page.getByTestId("harvest-composer").innerText()).includes("Your name goes with it. There are no anonymous harvests."), "the composer says who will see it");
  await shot(author.page, "harvest-event-390x844");
  await author.page.getByTestId("harvest-share").click();
  expect(await author.page.locator("#hv-f.has-error").count() === 1, "an empty harvest is refused");
  await author.page.locator("#hv-t").fill("I stood at the pond in the cold and said the name of our ditch out loud.");
  // A real (tiny) PNG; the page shrinks and re-encodes it as a JPEG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC", "base64");
  await author.page.getByTestId("harvest-photo-input").setInputFiles({ name: "pond.png", mimeType: "image/png", buffer: png });
  await author.page.locator(".compose .ph img").waitFor({ timeout: 10_000 });
  await shot(author.page, "harvest-composer-photo-390x844");
  await author.page.getByTestId("harvest-share").click();
  await author.page.getByTestId("harvest-mine").waitFor({ timeout: 15_000 });
  expect(sql("SELECT has_photo FROM harvests")[0]?.has_photo === 1 && sql("SELECT COUNT(*) AS n FROM harvest_photos")[0].n === 1, "shared, with its photo");
  const photoOk = await author.page.evaluate(async () => {
    const img = document.querySelector('[data-testid="harvest-mine"] img');
    if (!img) return false;
    await img.decode().catch(() => {});
    return img.naturalWidth > 0;
  });
  expect(photoOk, "the photo loads for its author (members-only route, same cookie)");
  await shot(author.page, "harvest-mine-390x844");
  await author.page.getByTestId("harvest-menu").click();
  await author.page.getByTestId("harvest-menu-edit").click();
  await author.page.getByTestId("harvest-editor").waitFor();
  await author.page.locator("#hv-t").fill("I stood at the pond in the cold and said the name of our ditch out loud. I want to know where it begins.");
  await shot(author.page, "harvest-edit-390x844");
  await author.page.getByTestId("harvest-save").click();
  await author.page.getByTestId("harvest-edited").waitFor();
  ok("editing shows the Edited marker");
  await author.page.reload({ waitUntil: "networkidle" });
  await author.page.getByTestId("harvest-mine").waitFor({ timeout: 15_000 });
  await author.page.goto("/today", { waitUntil: "networkidle" });
  expect((await author.page.getByTestId("harvest-card").innerText()).includes("is shared"), "after sharing, the Today card says it is shared (and offers the link)");

  // Another member reads it and reports it; a steward hides it.
  const reader = await persona("mock-peer");
  await reader.page.goto(eventHref, { waitUntil: "networkidle" });
  const theirs = reader.page.getByTestId("harvest-post");
  await theirs.first().waitFor({ timeout: 15_000 });
  expect((await theirs.first().innerText()).includes("said the name of our ditch"), "another member sees the harvest");
  expect(await reader.page.getByTestId("harvest-composer").count() === 1, "…and, having not written one, is offered the composer");
  await shot(reader.page, "harvest-event-others-390x844");
  await theirs.first().getByRole("button", { name: "Report" }).click();
  await reader.page.getByRole("button", { name: "Unkind" }).click();
  await reader.page.getByRole("button", { name: "Send report" }).click();
  await reader.page.getByRole("status").filter({ hasText: /Thank/ }).waitFor({ timeout: 10_000 });
  const reports = sql("SELECT post_uri, reporter_did, excerpt FROM board_reports");
  expect(reports.length === 1 && reports[0].post_uri.startsWith("cohere:harvest/") && reports[0].reporter_did === PEER && reports[0].excerpt.includes("ditch"), "Report files a Board-tables row under the verified reporter, with the real text");
  const queue = await api("/api/admin/board", { cookie: adminCookie });
  expect(queue.json?.reports?.[0]?.link?.includes("ev-ended1"), "the steward's queue shows it with a link to the event page");
  const hideUri = queue.json.reports[0].postUri;
  expect((await api("/api/admin/board/hide", { method: "POST", cookie: adminCookie, body: { uri: hideUri, reason: "unkind" } })).status === 200, "a steward hides it");
  await reader.page.reload({ waitUntil: "networkidle" });
  await reader.page.getByTestId("harvest-composer").waitFor();
  expect(await reader.page.getByTestId("harvest-post").count() === 0, "hidden: gone for other members");
  await author.page.goto(eventHref, { waitUntil: "networkidle" });
  await author.page.getByTestId("mod-mark").waitFor({ timeout: 15_000 });
  ok("…and marked, for its author");
  await api("/api/admin/board/unhide", { method: "POST", cookie: adminCookie, body: { uri: hideUri } });

  // Members only.
  const outsider = await persona("mock-outsider");
  await outsider.page.goto(eventHref, { waitUntil: "networkidle" });
  await outsider.page.locator('[data-testid="harvest-section"][data-state="not-member"]').waitFor({ timeout: 15_000 });
  expect(!(await outsider.page.getByText("said the name of our ditch").count()), "a signed-in non-member sees the gate, not the harvests");
  const direct = await outsider.page.evaluate(async (path) => (await fetch(path)).status, "/api/harvests?event=did:plc:mockscene/ev-ended1");
  expect(direct === 403, "…and the API refuses them");
  const signedOut = await persona(null);
  await signedOut.page.goto(eventHref, { waitUntil: "networkidle" });
  await signedOut.page.locator('[data-testid="harvest-section"][data-state="signed-out"]').waitFor({ timeout: 15_000 });
  expect((await api("/api/harvests?event=did:plc:mockscene/ev-ended1")).status === 401, "signed out: 401");

  // Not yet over: an upcoming event says when harvests open.
  await signedOut.page.goto(`/events/${encodeURIComponent("did:plc:mockscene")}/ev-seed1`, { waitUntil: "networkidle" });
  await signedOut.page.locator('[data-testid="harvest-section"][data-state="not-yet"]').waitFor({ timeout: 15_000 });
  ok("an event that hasn't ended says 'Harvests open when the event ends.'");

  // The ⋯ menu in the ecology look, on the event page and on Today: screenshots, Escape, and the confirm step.
  const eco = await persona("sess-1", { look: "ecology" });
  await eco.page.goto(`${eventHref}?look=ecology`, { waitUntil: "networkidle" });
  const menuButton = eco.page.getByTestId("harvest-menu");
  await menuButton.waitFor({ timeout: 15_000 });
  expect((await menuButton.getAttribute("aria-label")) === "Harvest options", "the ⋯ is a button with an aria-label");
  expect(await eco.page.getByRole("button", { name: "Edit", exact: true }).count() === 0 && await eco.page.getByRole("button", { name: "Delete", exact: true }).count() === 0, "no loose Edit / Delete buttons on the card");
  await menuButton.click();
  await eco.page.getByRole("menu").waitFor();
  expect((await menuButton.getAttribute("aria-expanded")) === "true", "the ⋯ opens a menu with Edit and Delete");
  await shot(eco.page, "harvest-menu-open-event-390x844");
  await eco.page.keyboard.press("Escape");
  await eco.page.getByRole("menu").waitFor({ state: "detached" });
  expect(await eco.page.evaluate(() => document.activeElement?.getAttribute("data-testid")) === "harvest-menu", "Escape closes the menu and focus returns to the ⋯");
  await menuButton.click();
  await eco.page.getByTestId("harvest-menu-delete").click();
  await eco.page.getByTestId("harvest-delete-yes").waitFor();
  expect((await eco.page.getByRole("dialog").innerText()).includes("Delete this harvest?"), "Delete asks \"Delete this harvest?\" first");
  expect(sql("SELECT COUNT(*) AS n FROM harvests")[0].n === 1, "…and nothing is deleted yet");
  await shot(eco.page, "harvest-delete-confirm-390x844");
  await eco.page.getByTestId("harvest-delete-cancel").click();
  await eco.page.getByRole("dialog").waitFor({ state: "detached" });
  expect(sql("SELECT COUNT(*) AS n FROM harvests")[0].n === 1, "Cancel keeps the harvest");
  expect(await eco.page.evaluate(() => document.activeElement?.getAttribute("data-testid")) === "harvest-menu", "…and focus returns to the ⋯");
  await eco.page.goto("/today?look=ecology", { waitUntil: "networkidle" });
  await eco.page.getByTestId("harvest-card").locator('[data-testid="harvest-menu"]').waitFor({ timeout: 20_000 });
  await eco.page.getByTestId("harvest-card").getByTestId("harvest-menu").click();
  await shot(eco.page, "harvest-menu-open-today-390x844");
  await eco.page.getByTestId("harvest-menu-delete").click();
  await eco.page.getByTestId("harvest-delete-yes").waitFor();
  await shot(eco.page, "harvest-delete-confirm-today-390x844");
  await eco.page.getByTestId("harvest-delete-cancel").click();
  expect(sql("SELECT COUNT(*) AS n FROM harvests")[0].n === 1, "Today's card: Cancel keeps it too");
  await eco.page.getByTestId("harvest-card").getByTestId("harvest-menu").click();
  await eco.page.getByTestId("harvest-menu-edit").click();
  await eco.page.getByTestId("harvest-editor").waitFor({ timeout: 15_000 });
  ok("Today's card: Edit opens the editor on the event page");

  // Delete, then write another.
  await author.page.getByTestId("harvest-menu").click();
  await author.page.getByTestId("harvest-menu-delete").click();
  await shot(author.page, "harvest-delete-390x844");
  await author.page.getByTestId("harvest-delete-yes").click();
  await author.page.getByTestId("harvest-composer").waitFor({ timeout: 15_000 });
  expect(sql("SELECT COUNT(*) AS n FROM harvests")[0].n === 0 && sql("SELECT COUNT(*) AS n FROM harvest_photos")[0].n === 0, "delete removed the harvest and its photo");
  expect(sql("SELECT status FROM board_reports")[0]?.status !== "open", "…and closed the open report");

  // ── 7. Spanish and the small phone ───────────────────────────────────────────
  step = "spanish and small phones";
  const es = await persona("mock-peer", { app: true, device: installed.device });
  await es.page.goto("/more/notifications", { waitUntil: "networkidle" });
  await es.page.getByTestId("notify-reach").waitFor({ timeout: 15_000 });
  await es.page.getByRole("button", { name: "Es", exact: true }).click();
  await es.page.getByText("Cómo te avisamos").waitFor();
  const esText = await es.page.locator("main").innerText();
  expect(esText.includes("Cómo te avisamos") && esText.includes("Nota de la mañana") && esText.includes("Invitación a la cosecha"), "settings render in Spanish");
  await shot(es.page, "notify-settings-es-390x844");
  const small = await persona("mock-peer", { app: true, device: installed.device, viewport: { width: 360, height: 780 } });
  for (const [path, label] of [["/more/notifications", "settings"], ["/tomorrow", "tomorrow"], [eventHref, "event with harvest"], [`/n/${link({ p: sam, k: "unsub", t: "all" })}`, "unsubscribe"]]) {
    await small.page.goto(path, { waitUntil: "networkidle" });
    await small.page.locator("main").waitFor();
    await small.page.waitForTimeout(400);
    await noSideways(small.page, `${label} at 360px`);
  }
  await small.page.goto("/more/notifications", { waitUntil: "networkidle" });
  await small.page.getByTestId("notify-reach").waitFor();
  await shot(small.page, "notify-settings-360x780");
  await small.page.goto("/tomorrow", { waitUntil: "networkidle" });
  await shot(small.page, "notify-tomorrow-360x780");

  // ── 8. Email by default for people registered for 2026, and the status bar ───
  step = "email by default";
  const bea = "bea@example.test";
  sqlRun(`INSERT INTO people (id, email, name, subscribed, unsubscribe_token, created_at, updated_at) VALUES ('p-bea-${stamp}','${bea}','Bea',1,'tok-bea-${stamp}','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')`);
  sqlRun(`INSERT INTO submissions (id, person_id, form_slug, data, created_at, updated_at) VALUES ('s-bea-${stamp}','p-bea-${stamp}','register-2026','{}','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')`);
  const registered = await persona("mock-builder", { look: "ecology" });
  await registered.page.goto("/more/notifications?look=ecology", { waitUntil: "networkidle" });
  await registered.page.getByTestId("notify-reach").waitFor({ timeout: 15_000 });
  expect((await reachText(registered.page)).includes(bea), "registered: their registration address is the one we write to");
  expect((await note(registered.page, "evening").getAttribute("data-on")) === "true" && (await note(registered.page, "evening").getAttribute("data-channel")) === "email", "registered: the 8 PM note is on, by email, with nothing switched");
  expect((await note(registered.page, "morning").getAttribute("data-on")) === "false" && (await note(registered.page, "harvest").getAttribute("data-on")) === "false", "registered: the morning note and the harvest invitation stay off");
  expect((await registered.page.getByTestId("evening-email").getAttribute("aria-pressed")) === "true" && (await registered.page.getByTestId("evening-phone").getAttribute("aria-pressed")) === "false", "registered: Email is pressed, Phone is not");
  expect(sql(`SELECT COUNT(*) AS n FROM notify_prefs WHERE person_key = 'did:plc:mockbuilder' AND evening_on IS NOT NULL`)[0].n === 0, "…and no preference row was written to get there");
  await shot(registered.page, "me-notifications-registered-390x844");
  // (The ecology masthead's language switcher already runs ~20px past a 390px phone, with or without these
  // screens; it is reported, not asserted here. What these screens add must fit.)
  expect(await registered.page.evaluate(() => [...document.querySelectorAll('main *')].every((el) => el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1)), "settings, registered, ecology: nothing in the page body runs past the phone");

  await registered.page.goto("/today?look=ecology", { waitUntil: "networkidle" });
  await registered.page.locator("main").waitFor();
  await registered.page.waitForTimeout(500);
  expect(await registered.page.getByTestId("notify-status-bar").count() === 0, "status bar: hidden while they get the 8 PM email");
  await registered.page.goto("/more/notifications?look=ecology", { waitUntil: "networkidle" });
  await note(registered.page, "evening").getByRole("switch").click();
  await registered.page.waitForFunction(() => document.querySelector('[data-testid="note-evening"]')?.getAttribute("data-on") === "false");
  await registered.page.goto("/today?look=ecology", { waitUntil: "networkidle" });
  const bar = registered.page.getByTestId("notify-status-bar");
  await bar.waitFor({ timeout: 15_000 });
  expect((await bar.innerText()).includes("You’re not getting notifications."), "status bar: says so in plain words when every note is off");
  await shot(registered.page, "status-bar-today-390x844");
  expect(await bar.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth + 1; }), "status bar: fits the phone, edge to edge");
  await bar.click();
  await registered.page.getByTestId("notify-reach").waitFor({ timeout: 15_000 });
  expect(registered.page.url().includes("/more/notifications"), "status bar: opens the notification settings");
  await note(registered.page, "evening").getByRole("switch").click();
  await registered.page.waitForFunction(() => document.querySelector('[data-testid="note-evening"]')?.getAttribute("data-on") === "true");
  await registered.page.goto("/", { waitUntil: "networkidle" });
  await registered.page.waitForTimeout(500);
  expect(await registered.page.getByTestId("notify-status-bar").count() === 0, "status bar: gone again once a note is on");
} catch (error) {
  fail(`stopped: ${error instanceof Error ? error.stack ?? error.message : error}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("\nNotifications and Harvest e2e passed.");
