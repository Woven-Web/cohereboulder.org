// End-to-end proof of the Newsletter tab and the Beehiiv import, in a real
// browser against a local wrangler dev + scripts/resend-mock.mjs. Never sends
// a real email: the Worker's RESEND_API_BASE points at the mock.
//
//   1. Beehiiv import: preview writes nothing, apply merges, re-preview is a no-op
//   2. draft → send is locked (UI and API) → test to self → edit re-locks →
//      test again → typed count wrong is refused → right count schedules it,
//      every admin gets a cancel link → the link (GET harmless, POST cancels)
//   3. reopen → test → confirm → cron before the hold sends nothing → cron
//      after the hold sends exactly N, each with List-Unsubscribe headers and
//      its own idempotency key → another cron sends 0 more
//   4. the one-click List-Unsubscribe POST unsubscribes
//   5. Resend webhooks, Svix-signed exactly as Resend signs them: unsigned and
//      wrongly signed posts are 401; delivered / hard bounce / soft bounce /
//      complaint land on the right D1 rows; a replayed svix-id changes nothing;
//      the undeliverable and the complainer drop out of the next audience
//      count; the Newsletter tab shows delivered/bounced/complained
//
// Usage:
//   PORT=9960 node scripts/resend-mock.mjs &
//   npx wrangler dev --port 8796 --test-scheduled --persist-to <dir> \
//     --var RESEND_API_BASE:http://127.0.0.1:9960 --var RESEND_API_KEY:mock-key \
//     --var PUBLIC_BASE_URL:http://127.0.0.1:8796 --var RESEND_WEBHOOK_SECRET:<whsec_…>
//   E2E_PERSIST_DIR=<dir> RESEND_WEBHOOK_SECRET=<same whsec_…> node scripts/newsletter-e2e.mjs http://127.0.0.1:8796 <admin-session-token> http://127.0.0.1:9960
//
// The admin session is a KV row for an `admins` address (see ci-e2e.sh).

import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const target = process.argv[2];
const sessionToken = process.argv[3];
const mockUrl = process.argv[4] ?? "http://127.0.0.1:9960";
const persist = process.env.E2E_PERSIST_DIR;
// A throwaway test-only signing key, the same one ci-e2e.sh hands the Worker.
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
if (!target || !sessionToken || !persist || !webhookSecret) {
  console.error("usage: E2E_PERSIST_DIR=<dir> RESEND_WEBHOOK_SECRET=<whsec_…> node scripts/newsletter-e2e.mjs <wrangler-dev-url> <admin-session-token> [resend-mock-url]");
  process.exit(2);
}

const failures = [];
let step = "";
function ok(message) {
  console.log(`ok    ${message}`);
}
function fail(message) {
  failures.push(`${step}: ${message}`);
  console.error(`FAIL  ${step}: ${message}`);
}
function expect(condition, message) {
  if (condition) ok(message);
  else fail(message);
}

const stamp = Date.now().toString(36);
const NEWSLETTER_CRON = "* * * * *";

function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "cohere", "--local", "--persist-to", persist, "--json", "--command", sql],
    { encoding: "utf8" },
  );
  return JSON.parse(out)[0].results;
}

async function mockMessages(request) {
  return (await (await request.get(`${mockUrl}/_messages`)).json()).messages;
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: target });
const api = context.request;
const cookie = { Cookie: `cohere_session=${sessionToken}` };

async function adminGet(path) {
  const res = await api.get(path, { headers: cookie });
  return { status: res.status(), body: await res.json() };
}
async function adminPost(path, data) {
  const res = await api.post(path, { headers: { ...cookie, Origin: target }, data });
  return { status: res.status(), body: await res.json() };
}
async function runCron(time) {
  const res = await api.get(`/cdn-cgi/local/scheduled?cron=${encodeURIComponent(NEWSLETTER_CRON)}&time=${time}`);
  if (!res.ok()) throw new Error(`scheduled trigger answered ${res.status()}`);
}

try {
  await api.post(`${mockUrl}/_reset`);

  // ── 0. Seed: some list members, one unsubscribed, one undeliverable ─────
  step = "seed";
  const people = [
    [`nl-a-${stamp}@example.org`, 1, null],
    [`nl-b-${stamp}@example.org`, 1, "volunteer"],
    [`nl-gone-${stamp}@example.org`, 0, null],
    [`nl-bounce-${stamp}@example.org`, 1, "beehiiv,undeliverable"],
  ];
  d1(
    "INSERT INTO people (id, email, subscribed, unsubscribe_token, source, tags, created_at, updated_at) VALUES " +
      people
        .map(([email, sub, tags], i) => `('nl-${stamp}-${i}', '${email}', ${sub}, 'nltok${stamp}${i}', 'e2e', ${tags ? `'${tags}'` : "NULL"}, '2026-01-01', '2026-01-01')`)
        .join(", "),
  );
  const anon = await api.get("/api/admin/newsletters");
  expect(anon.status() === 401, `anonymous newsletter API is refused (${anon.status()})`);
  const anonImport = await api.post("/api/admin/import/beehiiv", { headers: { Origin: target }, data: { csv: "email\nx@y.org", apply: true } });
  expect(anonImport.status() === 401, `anonymous import is refused (${anonImport.status()})`);

  // ── 1. Beehiiv import, through the UI ────────────────────────────────────
  step = "beehiiv import";
  await context.addCookies([{ name: "cohere_session", value: sessionToken, url: target, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => fail(`uncaught page error — ${error}`));
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Newsletter", exact: true }).click();

  const header =
    "subscriber_id,api_subscription_id,email,tags,status,created_at,updated_at,unsubscribed_at,stripe_customer_id,referred_by,campaign,channel,acquisition_source,referring_url,acquisition_term,acquisition_content,device_type,total_revenue_cents,referral_count,total_sent,total_delivered,total_unique_opened,total_clicked,total_unique_clicked,open_rate,click_rate,last_opened_at,last_clicked_at,Free Tier,Name";
  const row = (email, status, tags, unsub, name) => {
    const cells = Array(30).fill("");
    Object.assign(cells, { 0: "sub", 2: email, 3: tags, 4: status, 7: unsub, 29: name });
    return cells.map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
  };
  const csv = [
    header,
    row(`bh-new-${stamp}@example.org`, "active", '["cohere-2024"]', "", "Bee Hive"),
    row(`bh-old-${stamp}@example.org`, "inactive", "", "2026-02-01T00:00:00Z", ""),
    row(`NL-GONE-${stamp}@example.org`, "active", "", "", "Should Stay Gone"),
    row(`nl-b-${stamp}@example.org`, "active", "cohere-2024", "", ""),
    row("not-an-email", "active", "", "", ""),
  ].join("\n");
  const dir = mkdtempSync(join(tmpdir(), "nl-e2e-"));
  const csvPath = join(dir, "beehiiv.csv");
  writeFileSync(csvPath, csv);
  await page.locator("#bhfile").setInputFiles(csvPath);
  await page.getByRole("button", { name: "Preview import" }).click();
  await page.locator("#bhresult").getByText("Preview — nothing written yet").waitFor({ timeout: 10_000 });
  const preview = await page.locator("#bhresult").textContent();
  expect(/5 rows: 2 new \(1 of them unsubscribed\), 2 already here/.test(preview) && /1 skipped as invalid/.test(preview), `preview counts: ${preview}`);
  expect(d1(`SELECT COUNT(*) AS n FROM people WHERE email LIKE 'bh-%-${stamp}@example.org'`)[0].n === 0, "preview wrote nothing");
  await page.getByRole("button", { name: "Apply import" }).click();
  await page.locator("#bhresult").getByText("Imported.").waitFor({ timeout: 15_000 });
  const imported = Object.fromEntries(
    d1(`SELECT email, name, tags, subscribed, source FROM people WHERE email LIKE '%${stamp}@example.org'`).map((p) => [p.email.split("-")[0] + "-" + p.email.split("-")[1], p]),
  );
  expect(imported["bh-new"]?.subscribed === 1 && imported["bh-new"]?.source === "beehiiv" && imported["bh-new"]?.tags === "beehiiv,cohere-2024" && imported["bh-new"]?.name === "Bee Hive", "a new active subscriber is added, tagged, named");
  expect(imported["bh-old"]?.subscribed === 0, "a Beehiiv unsubscribe is imported as unsubscribed");
  expect(imported["nl-gone"]?.subscribed === 0, "a site unsubscribe is never re-subscribed");
  expect(imported["nl-b"]?.tags === "volunteer,beehiiv,cohere-2024" && imported["nl-b"]?.subscribed === 1, "an existing person gains the tags");
  const again = await adminPost("/api/admin/import/beehiiv", { csv });
  expect(again.body.pending === 0, `re-importing changes nothing (pending ${again.body.pending})`);

  // ── 2. Draft, lock, test, re-lock, confirm, cancel ──────────────────────
  step = "draft + safeguards";
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Newsletter", exact: true }).click();
  await page.getByRole("button", { name: "New newsletter" }).click();
  const subject = `E2E October update ${stamp}`;
  await page.locator("#nlsubject").fill(subject);
  await page.locator("#nlbody").fill("Hello <b>friends</b>,\n\nSee [the calendar](https://cohereboulder.org/calendar).\n\n- one\n- two");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.locator("#nlmsg").getByText("Saved.").waitFor({ timeout: 10_000 });
  expect(await page.getByRole("button", { name: "Send…" }).isDisabled(), "send is disabled before a test");
  const list = await adminGet("/api/admin/newsletters");
  const draft = list.body.newsletters.find((n) => n.subject === subject);
  if (!draft) throw new Error("the draft wasn't saved");
  const id = draft.id;
  let r = await adminPost(`/api/admin/newsletters/${id}/send`, { confirm_count: 1 });
  expect(r.status === 409 && r.body.locked === true, `API refuses an untested send (${r.status})`);

  // The preview is live (debounced fetch of the server renderer); no button.
  const frame = page.frameLocator("#nlframe");
  await frame.getByText("Hello <b>friends</b>,").waitFor({ timeout: 10_000 });
  expect((await frame.locator("b").count()) === 0, "organizer HTML is shown as text in the preview, not rendered");
  await frame.getByRole("link", { name: "Unsubscribe" }).waitFor();
  ok("preview renders the mail shell with an unsubscribe footer");

  await page.getByRole("button", { name: "Send me a test" }).click();
  await page.locator("#nlmsg").getByText("Test sent to ci-e2e@cohere.test").waitFor({ timeout: 10_000 });
  let msgs = await mockMessages(api);
  expect(msgs.length === 1 && msgs[0].to[0] === "ci-e2e@cohere.test" && msgs[0].subject === `[TEST] ${subject}`, "the test went to the organizer only, marked [TEST]");
  expect(msgs[0].from === "COhere Boulder <hello@news.cohereboulder.org>" && msgs[0].reply_to === "COhere@wovenweb.org", `from/reply-to: ${msgs[0].from} / ${msgs[0].reply_to}`);
  expect(!(await page.getByRole("button", { name: "Send…" }).isDisabled()), "send unlocks after the test");

  await page.locator("#nlbody").fill("Hello friends — edited.\n\nSee you soon.");
  expect(await page.getByRole("button", { name: "Send…" }).isDisabled(), "editing re-locks send in the page");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.locator("#nlmsg").getByText("Saved.").waitFor({ timeout: 10_000 });
  expect(await page.getByRole("button", { name: "Send…" }).isDisabled(), "still locked after saving the edit");
  r = await adminPost(`/api/admin/newsletters/${id}/send`, { confirm_count: 1 });
  expect(r.status === 409 && r.body.locked === true, "API refuses a send of the edited, untested version");

  await page.getByRole("button", { name: "Send me a test" }).click();
  await page.locator("#nlmsg").getByText("Test sent to").waitFor({ timeout: 10_000 });
  expect((await mockMessages(api)).length === 2, "a second test went out for the edited version");

  // Who should receive it: subscribed, not undeliverable — computed here independently.
  const peopleNow = (await adminGet("/api/admin/people")).body.people;
  const expected = peopleNow
    .filter((p) => p.subscribed && !String(p.tags ?? "").toLowerCase().split(",").map((t) => t.trim()).includes("undeliverable"))
    .map((p) => p.email)
    .sort();
  const count = (await adminPost("/api/admin/newsletters/count", { audience: { kind: "all" } })).body.count;
  expect(count === expected.length && count > 0, `live count ${count} matches the list (${expected.length})`);
  expect(!expected.includes(`nl-gone-${stamp}@example.org`) && !expected.includes(`nl-bounce-${stamp}@example.org`), "unsubscribed and undeliverable people are excluded");
  if (count > 40) throw new Error(`this lane expects one cron tick to cover the list; got ${count}`);

  await page.getByRole("button", { name: "Send…" }).click();
  await page.getByTestId("nl-confirm").waitFor();
  expect((await page.locator("#nlconfirmcount").textContent()) === String(count), "confirm screen shows the exact count");
  await page.locator("#nlconfirminput").fill(String(count + 1));
  await page.getByRole("button", { name: "Confirm and schedule" }).click();
  await page.locator("#nlmsg").getByText(`Type the exact number of recipients (${count})`).waitFor({ timeout: 10_000 });
  expect((await adminGet(`/api/admin/newsletters/${id}`)).body.newsletter.status === "draft", "a wrong number is refused and nothing is scheduled");
  await page.locator("#nlconfirminput").fill(String(count));
  await page.getByRole("button", { name: "Confirm and schedule" }).click();
  await page.locator("#nlmsg").getByText("Scheduled for").waitFor({ timeout: 10_000 });
  let nl = (await adminGet(`/api/admin/newsletters/${id}`)).body.newsletter;
  const holdMs = Date.parse(nl.scheduled_for) - Date.parse(nl.confirmed_at);
  expect(nl.status === "scheduled" && holdMs === 15 * 60 * 1000, `scheduled 15 minutes out (${holdMs} ms)`);
  expect(nl.confirmed_by === "ci-e2e@cohere.test" && nl.recipient_count_confirmed === count, "records who confirmed and the count");
  expect(!("cancel_token" in nl), "the cancel token never reaches the admin API");

  msgs = await mockMessages(api);
  const notice = msgs[2];
  const link = notice?.text?.match(/(\/newsletter\/cancel\?token=[a-f0-9]{64})/)?.[1];
  expect(msgs.length === 3 && notice.to[0] === "ci-e2e@cohere.test" && !!link, "every admin is emailed a cancel link");

  step = "cancel link";
  const preflight = await api.get(link);
  expect(preflight.status() === 200, "the cancel link's GET answers a confirm page");
  expect((await adminGet(`/api/admin/newsletters/${id}`)).body.newsletter.status === "scheduled", "a plain GET (a link scanner) cancels nothing");
  const linkPage = await context.newPage();
  await linkPage.goto(link);
  await linkPage.getByRole("button", { name: "Yes, cancel the send" }).click();
  await linkPage.getByText("Send cancelled").waitFor({ timeout: 10_000 });
  await linkPage.close();
  nl = (await adminGet(`/api/admin/newsletters/${id}`)).body.newsletter;
  expect(nl.status === "cancelled" && nl.cancelled_by === "email-link", "the emailed link cancelled it without sign-in");
  await runCron(Date.parse(nl.scheduled_for) + 60_000);
  expect((await mockMessages(api)).length === 3, "the cron sends nothing for a cancelled newsletter");

  // ── 3. Reopen, re-test, confirm, and let the cron send it ───────────────
  step = "send";
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Newsletter", exact: true }).click();
  await page.locator("#nlrows tr", { hasText: subject }).click();
  await page.getByRole("button", { name: "Reopen as draft" }).click();
  await page.getByRole("button", { name: "Send me a test" }).waitFor();
  expect(await page.getByRole("button", { name: "Send…" }).isDisabled(), "a reopened draft needs a fresh test");
  await page.getByRole("button", { name: "Send me a test" }).click();
  await page.locator("#nlmsg").getByText("Test sent to").waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: "Send…" }).click();
  await page.locator("#nlconfirminput").fill(String(count));
  await page.getByRole("button", { name: "Confirm and schedule" }).click();
  await page.locator("#nlmsg").getByText("Scheduled for").waitFor({ timeout: 10_000 });
  nl = (await adminGet(`/api/admin/newsletters/${id}`)).body.newsletter;
  const before = (await mockMessages(api)).length; // 3 + test + notice = 5

  await runCron(Date.parse(nl.scheduled_for) - 60_000);
  expect((await mockMessages(api)).length === before, "nothing is sent during the hold");
  await runCron(Date.parse(nl.scheduled_for) + 30_000);
  msgs = await mockMessages(api);
  const blast = msgs.slice(before);
  const recipients = blast.map((m) => m.to[0]).sort();
  expect(blast.length === count, `the cron sent exactly ${count} (got ${blast.length})`);
  expect(JSON.stringify(recipients) === JSON.stringify(expected), "to exactly the expected people");
  expect(
    blast.every(
      (m) =>
        m.subject === subject &&
        /^<http:\/\/127\.0\.0\.1:\d+\/unsubscribe\?token=[^>]+>$/.test(m.headers?.["List-Unsubscribe"] ?? "") &&
        m.headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" &&
        m.html.includes(m.headers["List-Unsubscribe"].slice(1, -1).replace(/&/g, "&amp;")),
    ),
    "each carries its own List-Unsubscribe link (header and footer) and One-Click",
  );
  expect(new Set(blast.map((m) => m.idempotencyKey)).size === count && blast.every((m) => m.idempotencyKey?.startsWith(`newsletter:${id}:`)), "each has its own idempotency key");
  expect(blast.every((m) => m.tags?.find((t) => t.name === "newsletter_id")?.value === id && m.tags?.find((t) => t.name === "person_id")?.value),
    "each send carries newsletter/person correlation tags (not addresses)");
  nl = (await adminGet(`/api/admin/newsletters/${id}`)).body.newsletter;
  expect(nl.status === "sent" && nl.counts.sent === count, `marked sent with a full log (${nl.status}, ${nl.counts.sent})`);

  await runCron(Date.parse(nl.scheduled_for) + 90_000);
  await runCron(Date.parse(nl.scheduled_for) + 150_000);
  expect((await mockMessages(api)).length === msgs.length, "re-running the cron sends 0 more");

  // ── 4. RFC 8058 one-click unsubscribe, as a mail client would POST it ───
  step = "one-click unsubscribe";
  const mine = blast.find((m) => m.to[0] === `nl-a-${stamp}@example.org`);
  const unsub = new URL(mine.headers["List-Unsubscribe"].slice(1, -1));
  const oneClick = await api.post(unsub.pathname + unsub.search, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: "List-Unsubscribe=One-Click",
  });
  expect(oneClick.status() === 200, `one-click POST answered ${oneClick.status()}`);
  expect(d1(`SELECT subscribed FROM people WHERE email = 'nl-a-${stamp}@example.org'`)[0].subscribed === 0, "one-click unsubscribed them");
  const after = (await adminPost("/api/admin/newsletters/count", { audience: { kind: "all" } })).body.count;
  expect(after === count - 1, `and the live count drops to ${count - 1}`);

  // ── 5. Resend webhooks: bounces, complaints, deliveries ─────────────────
  step = "resend webhooks";
  let svixSeq = 0;
  async function webhook(event, { id, secret = webhookSecret, ts = Math.floor(Date.now() / 1000), signature } = {}) {
    const svixId = id ?? `msg_e2e_${stamp}_${++svixSeq}`;
    const body = JSON.stringify(event);
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const sig = signature ?? `v1,${createHmac("sha256", key).update(`${svixId}.${ts}.${body}`).digest("base64")}`;
    const res = await api.post("/api/webhooks/resend", {
      headers: { "Content-Type": "application/json", "svix-id": svixId, "svix-timestamp": String(ts), "svix-signature": sig },
      data: body,
    });
    return { status: res.status(), body: await res.json().catch(() => null), svixId };
  }
  const idFor = (email) => blast.find((m) => m.to[0] === email)?.id;
  const sendRow = (email) => d1(`SELECT status, last_event FROM newsletter_sends WHERE newsletter_id = '${id}' AND email = '${email}'`)[0];
  const evt = (type, email, extra = {}) => ({
    type,
    created_at: new Date().toISOString(),
    data: { email_id: idFor(email), to: [email], tags: Object.fromEntries((blast.find((m) => m.to[0] === email)?.tags ?? []).map((t) => [t.name, t.value])), subject, from: "COhere Boulder <hello@news.cohereboulder.org>", ...extra },
  });
  const hardEmail = `bh-new-${stamp}@example.org`;
  const spamEmail = `nl-b-${stamp}@example.org`;
  const okEmail = `nl-a-${stamp}@example.org`;
  if (!idFor(hardEmail) || !idFor(spamEmail) || !idFor(okEmail)) throw new Error("the blast is missing a recipient this step needs");
  const countBefore = (await adminPost("/api/admin/newsletters/count", { audience: { kind: "all" } })).body.count;

  let w = await api.post("/api/webhooks/resend", { headers: { "Content-Type": "application/json" }, data: evt("email.complained", spamEmail) });
  expect(w.status() === 401, `an unsigned webhook is refused (${w.status()})`);
  const wrongKey = `whsec_${Buffer.from("not-the-configured-key!!").toString("base64")}`;
  let wr = await webhook(evt("email.complained", spamEmail), { secret: wrongKey });
  expect(wr.status === 401, `a webhook signed with another secret is refused (${wr.status})`);
  wr = await webhook(evt("email.complained", spamEmail), { ts: Math.floor(Date.now() / 1000) - 600 });
  expect(wr.status === 401, `a ten-minute-old timestamp is refused (${wr.status})`);
  expect(d1(`SELECT subscribed FROM people WHERE email = '${spamEmail}'`)[0].subscribed === 1, "and none of them changed anything");

  wr = await webhook(evt("email.delivered", okEmail));
  expect(wr.status === 200 && wr.body?.effect === "delivered", `delivered is accepted (${wr.status} ${wr.body?.effect})`);
  expect(sendRow(okEmail)?.status === "delivered", "the send row is marked delivered");

  const hard = evt("email.bounced", hardEmail, {
    bounce: { type: "Permanent", subType: "General", message: `550 5.1.1 <${hardEmail}>: mailbox unavailable` },
  });
  wr = await webhook(hard);
  expect(wr.status === 200 && wr.body?.effect === "tagged-undeliverable", `a hard bounce tags the person (${wr.body?.effect})`);
  let hp = d1(`SELECT tags, internal_notes, subscribed FROM people WHERE email = '${hardEmail}'`)[0];
  expect(hp.tags === "beehiiv,cohere-2024,undeliverable", `tags now ${hp.tags}`);
  const noteRe = new RegExp(`^\\d{4}-\\d{2}-\\d{2}: Resend hard bounce, tagged undeliverable \\(Permanent/General\\)`);
  expect(noteRe.test(hp.internal_notes ?? "") && !(hp.internal_notes ?? "").includes(hardEmail), `a dated note, no address in it: ${hp.internal_notes}`);
  expect(sendRow(hardEmail)?.status === "bounced", "the send row is marked bounced");
  const replay = await webhook(hard, { id: wr.svixId });
  expect(replay.status === 200 && replay.body?.duplicate === true, "replaying the same svix-id is acknowledged as a duplicate");
  hp = d1(`SELECT tags, internal_notes FROM people WHERE email = '${hardEmail}'`)[0];
  expect(hp.tags === "beehiiv,cohere-2024,undeliverable" && hp.internal_notes.split("\n").length === 1, "and applies nothing twice");

  wr = await webhook(evt("email.bounced", spamEmail, { bounce: { type: "Transient", subType: "MailboxFull" } }));
  expect(wr.body?.effect === "soft-bounce-recorded", `a transient bounce is only recorded (${wr.body?.effect})`);
  expect(!/undeliverable/.test(d1(`SELECT tags FROM people WHERE email = '${spamEmail}'`)[0].tags ?? ""), "no undeliverable tag for a soft bounce");
  expect(sendRow(spamEmail)?.last_event === "bounced:Transient", "its send row records the event");

  wr = await webhook(evt("email.complained", spamEmail));
  expect(wr.body?.effect === "unsubscribed", `a complaint unsubscribes (${wr.body?.effect})`);
  const sp = d1(`SELECT subscribed, internal_notes FROM people WHERE email = '${spamEmail}'`)[0];
  expect(sp.subscribed === 0 && /marked a newsletter as spam/.test(sp.internal_notes ?? ""), "subscribed = 0, with a note");
  expect(sendRow(spamEmail)?.status === "complained", "the send row is marked complained");

  wr = await webhook({ type: "email.bounced", data: { email_id: "re_nobody", to: [`nobody-${stamp}@example.org`], bounce: { type: "Permanent" } } });
  expect(wr.status === 200 && wr.body?.effect === "unknown-recipient", `an unknown recipient is acknowledged (${wr.body?.effect})`);

  const countAfter = (await adminPost("/api/admin/newsletters/count", { audience: { kind: "all" } })).body.count;
  expect(countAfter === countBefore - 2, `the next audience drops the bounced and the complainer (${countBefore} → ${countAfter})`);

  nl = (await adminGet(`/api/admin/newsletters/${id}`)).body.newsletter;
  expect(nl.counts.delivered === 1 && nl.counts.bounced === 1 && nl.counts.complained === 1 && nl.counts.sent === count,
    `counts: ${JSON.stringify(nl.counts)}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Newsletter", exact: true }).click();
  const cell = page.locator("#nlrows tr", { hasText: subject }).getByTestId("nl-delivery-cell");
  await cell.getByText("1 delivered · 1 bounced · 1 complained").waitFor({ timeout: 10_000 });
  ok("the Newsletter tab shows 1 delivered · 1 bounced · 1 complained");
  const sentCell = await page.locator("#nlrows tr", { hasText: subject }).getByTestId("nl-sent-cell").textContent();
  expect(sentCell?.trim() === String(count), `the Sent column still counts all ${count} (${sentCell})`);
} catch (error) {
  fail(error.message.split("\n")[0]);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s).`);
  process.exit(1);
}
console.log("Newsletter e2e passed.");
