// End-to-end proof of door check-in (/admin/checkin) in a real browser at a
// phone viewport, against a local wrangler dev + the mock AppView. Never
// touches scenius.social, never sends mail (check-in sends none anyway), and
// every person here is invented.
//
//   0. anonymous: every /api/admin/checkin route answers 401; the page shows
//      a sign-in link and no data
//   1. seed: one email RSVP (public /api/rsvp) and one 2026 registrant (D1)
//   2. at 390x844, signed in: pick the event, see email RSVP + regenOS
//      confirmed guests merged, search, check an RSVP in, undo it
//   3. a registrant found by search, checked in
//   4. walk-in without opt-in (no people row) and with opt-in (subscribed
//      people row, source walkin:<rkey>); an unsubscribed address that ticks
//      the box stays unsubscribed; a hostile name renders as text
//   5. CSV export downloads and lists them
//   6. offline: a tap with the network down is queued, then syncs
//
// Usage:
//   PORT=9944 node scripts/regenos-mock.mjs &
//   npx wrangler dev --port 8790 --persist-to <dir> \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9944 \
//     --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
//   E2E_PERSIST_DIR=<dir> node scripts/checkin-e2e.mjs http://127.0.0.1:8790 <admin-session-token> http://127.0.0.1:9944
//
// The session token is a COHERE_AUTH KV row plus an `admins` row (see
// scripts/ci-e2e.sh seed_d1_and_kv).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const target = process.argv[2];
const sessionToken = process.argv[3];
const persist = process.env.E2E_PERSIST_DIR;
if (!target || !sessionToken || !persist) {
  console.error("usage: E2E_PERSIST_DIR=<dir> node scripts/checkin-e2e.mjs <wrangler-dev-url> <admin-session-token> [mock-url]");
  process.exit(2);
}

const SCENE = "did:plc:mockscene";
const RKEY = "ev-seed1";
const EVENT_PATH = `/api/admin/checkin/${encodeURIComponent(SCENE)}/${RKEY}`;
const stamp = Date.now().toString(36);
const rsvpEmail = `rsvp-${stamp}@example.org`;
const regEmail = `reg-${stamp}@example.org`;
const walkOptIn = `walk-in-${stamp}@example.org`;
const walkNoOpt = `walk-no-${stamp}@example.org`;
const unsubbed = `unsub-${stamp}@example.org`;
const HOSTILE = `<img src=x onerror="window.__xss=1">Mallory ${stamp}`;

const failures = [];
let step = "";
const ok = (m) => console.log(`ok    ${m}`);
function fail(m) {
  failures.push(`${step}: ${m}`);
  console.error(`FAIL  ${step}: ${m}`);
}
const expect = (cond, m) => (cond ? ok(m) : fail(m));

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "cohere", "--local", "--persist-to", persist, "--json", "--command", sql],
    { encoding: "utf8" },
  );
  return JSON.parse(out)[0].results;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL: target,
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true,
});
const page = await context.newPage();
page.on("pageerror", (e) => fail(`uncaught page error — ${e}`));
page.on("dialog", (d) => {
  fail(`unexpected dialog: ${d.message()}`);
  d.dismiss();
});

async function apiAdmin(method, path, data) {
  const res = await context.request.fetch(path, {
    method,
    headers: { Cookie: `cohere_session=${sessionToken}` },
    ...(data ? { data } : {}),
  });
  return { status: res.status(), body: res.headers()["content-type"]?.includes("json") ? await res.json() : await res.text() };
}

const roster = async () => (await apiAdmin("GET", EVENT_PATH)).body;
const person = (label) => page.locator('[data-testid="person"]', { hasText: label });

try {
  // ── 0. anonymous ──────────────────────────────────────────────────────────
  step = "anonymous";
  const anonChecks = [
    ["GET", "/api/admin/checkin/events"],
    ["GET", "/api/admin/checkin/registrants?q=ana"],
    ["GET", EVENT_PATH],
    ["POST", EVENT_PATH],
    ["DELETE", `${EVENT_PATH}/abcdefgh-1234`],
    ["GET", `${EVENT_PATH}/export.csv`],
  ];
  for (const [method, path] of anonChecks) {
    const res = await context.request.fetch(path, { method, data: method === "POST" ? { id: "abcdefgh", source: "walkin", name: "x" } : undefined });
    if (res.status() !== 401) fail(`${method} ${path} answered ${res.status()} anonymously`);
  }
  ok("every check-in API route answers 401 without a session");
  await page.goto("/admin/checkin", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Sign in" }).waitFor({ timeout: 10_000 });
  expect(!(await page.locator("#app").isVisible()), "the page shows only a sign-in link when signed out");

  // ── 1. seed ───────────────────────────────────────────────────────────────
  step = "seed";
  const rsvp = await context.request.post("/api/rsvp", { data: { did: SCENE, rkey: RKEY, email: rsvpEmail, name: `Rita Rsvp ${stamp}` } });
  if (!rsvp.ok()) throw new Error(`seeding the email RSVP answered ${rsvp.status()}`);
  const now = new Date().toISOString();
  d1(
    `INSERT INTO people (id, email, name, subscribed, unsubscribe_token, source, created_at, updated_at) VALUES
       ('p-reg-${stamp}', '${regEmail}', 'Regina Registrant ${stamp}', 1, 'tok-reg-${stamp}', 'form:register-2026', '${now}', '${now}'),
       ('p-uns-${stamp}', '${unsubbed}', NULL, 0, 'tok-uns-${stamp}', 'form:register-2026', '${now}', '${now}');
     INSERT INTO submissions (id, person_id, form_slug, event, data, created_at, updated_at) VALUES
       ('s-reg-${stamp}', 'p-reg-${stamp}', 'register-2026', 'october2026', '{}', '${now}', '${now}')`,
  );
  ok("seeded an email RSVP and a 2026 registrant");

  // ── 2. sign in, pick the event, merged list, search, check in, undo ─────
  step = "rsvp check-in";
  await context.addCookies([{ name: "cohere_session", value: sessionToken, url: target, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/admin/checkin", { waitUntil: "networkidle" });
  await page.locator("#app").waitFor({ state: "visible", timeout: 10_000 });
  const options = await page.locator("#event option").allTextContents();
  const seedOption = options.find((o) => o.includes("Seed Gathering"));
  if (!seedOption) throw new Error(`event picker lacks the seeded event: ${JSON.stringify(options)}`);
  await page.locator("#event").selectOption({ label: seedOption });
  await person(`Rita Rsvp ${stamp}`).waitFor({ timeout: 10_000 });
  await person("ana.mock.test").waitFor();
  expect((await page.locator("#n-expected").textContent()) === "3", "expected = 1 email RSVP + 2 regenOS confirmed guests");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width <= 390, `no horizontal scroll at 390px (scrollWidth ${width})`);
  const tapBox = await person(`Rita Rsvp ${stamp}`).getByRole("button", { name: /^Check in/ }).boundingBox();
  expect(tapBox && tapBox.height >= 44 && tapBox.width >= 88, `check-in button is a big tap target (${tapBox?.width}x${tapBox?.height})`);

  await page.locator("#q").fill("rita");
  expect((await page.locator('#expected [data-testid="person"]').count()) === 1, "search narrows the list to the match");
  await person(`Rita Rsvp ${stamp}`).getByRole("button", { name: /^Check in/ }).tap();
  await person(`Rita Rsvp ${stamp}`).getByRole("button", { name: /^Undo/ }).waitFor();
  await page.waitForFunction(() => !document.getElementById("sync").textContent, null, { timeout: 10_000 });
  let r = await roster();
  const ritaRow = r.expected.find((x) => x.email === rsvpEmail);
  expect(ritaRow?.checkinId && r.counts.checkedIn === 1, "the tap stored a check-in for the email RSVP");
  expect((await page.locator("#n-in").textContent()) === "1", "the checked-in count reads 1");

  await person(`Rita Rsvp ${stamp}`).getByRole("button", { name: /^Undo/ }).tap();
  await person(`Rita Rsvp ${stamp}`).getByRole("button", { name: /^Check in/ }).waitFor();
  await page.waitForFunction(() => !document.getElementById("sync").textContent, null, { timeout: 10_000 });
  r = await roster();
  expect(r.counts.checkedIn === 0, "undo deleted the row");
  // and in again, for the export
  await person(`Rita Rsvp ${stamp}`).getByRole("button", { name: /^Check in/ }).tap();
  await page.waitForFunction(() => !document.getElementById("sync").textContent, null, { timeout: 10_000 });

  // regenOS guest
  await page.locator("#q").fill("ana.mock");
  await person("ana.mock.test").getByRole("button", { name: /^Check in/ }).tap();
  await person("ana.mock.test").getByRole("button", { name: /^Undo/ }).waitFor();

  // ── 3. registrant via search ──────────────────────────────────────────────
  step = "registrant";
  await page.locator("#q").fill("regina");
  await page.locator("#registrants").getByText(`Regina Registrant ${stamp}`).waitFor({ timeout: 10_000 });
  await page.locator("#registrants").getByRole("button", { name: /^Check in/ }).tap();
  await page.locator("#others").getByText(`Regina Registrant ${stamp}`).waitFor({ timeout: 10_000 });
  await page.waitForFunction(() => !document.getElementById("sync").textContent, null, { timeout: 10_000 });
  r = await roster();
  expect(r.others.some((o) => o.email === regEmail && o.source === "registrant" && o.person_id === `p-reg-${stamp}`),
    "a registrant found by search checks in, linked to their person row");
  await page.locator("#q").fill("");

  // ── 4. walk-ins ───────────────────────────────────────────────────────────
  step = "walk-in";
  async function walkIn(name, email, subscribe) {
    await page.locator("#w-name").fill(name);
    await page.locator("#w-email").fill(email);
    if (subscribe) await page.locator("#w-sub").check();
    await page.getByRole("button", { name: "Check in walk-in" }).tap();
    await page.waitForFunction(() => !document.getElementById("sync").textContent, null, { timeout: 10_000 });
  }
  await walkIn(`Walt NoList ${stamp}`, walkNoOpt, false);
  await walkIn(`Wendy List ${stamp}`, walkOptIn, true);
  await walkIn(`Una Unsub ${stamp}`, unsubbed, true);
  await walkIn(HOSTILE, "", false);
  await page.locator("#others").getByText(`Mallory ${stamp}`).waitFor({ timeout: 10_000 });
  expect((await page.evaluate(() => window.__xss)) === undefined, "a hostile walk-in name renders as text, not markup");
  expect((await page.locator("#others img").count()) === 0, "no injected element in the list");
  expect((await page.locator("#n-walkins").textContent()) === "4", "walk-in count reads 4");

  const people = d1(`SELECT email, subscribed, source, unsubscribe_token FROM people WHERE email IN ('${walkNoOpt}', '${walkOptIn}', '${unsubbed}') ORDER BY email`);
  const byEmail = Object.fromEntries(people.map((p) => [p.email, p]));
  expect(!byEmail[walkNoOpt], "walk-in without the box ticked: no people row");
  expect(byEmail[walkOptIn]?.subscribed === 1 && byEmail[walkOptIn]?.source === `walkin:${RKEY}` && byEmail[walkOptIn]?.unsubscribe_token,
    "walk-in with the box ticked: subscribed people row, source walkin:<rkey>, unsubscribe token");
  expect(byEmail[unsubbed]?.subscribed === 0 && byEmail[unsubbed]?.source === "form:register-2026",
    "an unsubscribed address that ticks the box stays unsubscribed");

  // ── 5. CSV ────────────────────────────────────────────────────────────────
  step = "csv";
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export check-ins/ }).tap()]);
  const csv = readFileSync(await download.path(), "utf8");
  expect(download.suggestedFilename() === `checkins-${RKEY}.csv`, "CSV downloads with the event's filename");
  for (const needle of [rsvpEmail, regEmail, walkOptIn, walkNoOpt, "ana.mock.test", "walk-in", "ci-e2e@cohere.test"]) {
    if (!csv.includes(needle) && !(needle === "ana.mock.test" && csv.includes("did:plc:mockguest1"))) fail(`CSV lacks ${needle}`);
  }
  expect(csv.split("\n")[0].startsWith("name,email,regenos_guest,source,checked_in_at,checked_in_by"), "CSV has the expected header");

  // ── 6. bad wifi ───────────────────────────────────────────────────────────
  step = "offline";
  await context.setOffline(true);
  await page.locator("#w-name").fill(`Ollie Offline ${stamp}`);
  await page.getByRole("button", { name: "Check in walk-in" }).tap();
  await page.locator("#sync").getByText("1 waiting to sync").waitFor({ timeout: 5_000 });
  await page.locator("#others").getByText(`Ollie Offline ${stamp}`).waitFor();
  await context.setOffline(false);
  await page.waitForFunction(() => !document.getElementById("sync").textContent, null, { timeout: 20_000 });
  r = await roster();
  expect(r.others.some((o) => o.name === `Ollie Offline ${stamp}`), "a check-in made offline is queued and syncs once back online");
  expect(r.others.filter((o) => o.name === `Ollie Offline ${stamp}`).length === 1, "and syncs exactly once");

  // A failed send may actually have landed: offline undo queues a DELETE
  // behind the POST rather than forgetting an attempted operation.
  await context.setOffline(true);
  await page.locator("#w-name").fill(`Undo Offline ${stamp}`);
  await page.getByRole("button", { name: "Check in walk-in" }).tap();
  await person(`Undo Offline ${stamp}`).getByRole("button", { name: /^Undo/ }).tap();
  await context.setOffline(false);
  await page.waitForFunction(() => !document.getElementById("sync").textContent, null, { timeout: 20_000 });
  r = await roster();
  expect(!r.others.some((o) => o.name === `Undo Offline ${stamp}`), "undo of an offline attempted check-in syncs POST then DELETE");

  // A retried POST of a stored id is a no-op.
  const stored = r.others.find((o) => o.name === `Ollie Offline ${stamp}`);
  const retry = await apiAdmin("POST", EVENT_PATH, { id: stored.id, source: "walkin", name: "Ollie" });
  expect(retry.status === 200 && retry.body.already === true, "a retried check-in id answers already:true");
} catch (error) {
  fail(error.message.split("\n")[0]);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("Check-in e2e passed.");
