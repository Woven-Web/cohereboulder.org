// End-to-end proof of the members Board in a real browser, against a local
// wrangler dev + the mock AppView (scripts/regenos-mock.mjs). Never touches
// scenius.social or a real inbox.
//
//   1. signed out and signed-in-but-not-a-member get the gate — no posts, no count
//   2. a member reads the seeded feed, writes a post, replies in its thread, deletes it
//   3. Report: files a D1 row under the verified DID; the /admin Board tab shows it
//   4. Hide (reversible): gone for other members, the author still sees it marked,
//      and a direct proxy call cannot get it either; Unhide restores it
//   5. Remove (permanent): needs a note, cannot be unhidden
//   6. the approval switch: off by default; on holds a new post from a non-steward
//      (author sees it pending), Approve lets it through
//   7. the proxy only lends our collective
//   8. Spanish, a 390px phone with no sideways scroll, and no page errors throughout
//
// Usage (start the mock FRESH — its posts are in-memory):
//   PORT=9944 node scripts/regenos-mock.mjs
//   npx wrangler dev --port 8787 --var REGENOS_LOGIN_ENABLED:true \
//     --var REGENOS_BASE_URL:http://127.0.0.1:9944 --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
//   node scripts/board-e2e.mjs http://127.0.0.1:8787 <admin-session-token>
// (the admin session is seeded as in scripts/admin-events-e2e.mjs)

import { chromium } from "playwright";

const target = process.argv[2];
const adminToken = process.argv[3];
if (!target || !adminToken) {
  console.error("usage: node scripts/board-e2e.mjs <wrangler-dev-url> <admin-session-token>");
  process.exit(2);
}

const failures = [];
let step = "";
const ok = (m) => console.log(`ok    ${m}`);
const fail = (m) => { failures.push(`${step}: ${m}`); console.error(`FAIL  ${step}: ${m}`); };
const expect = (c, m) => (c ? ok(m) : fail(m));
const stamp = Date.now().toString(36);

const browser = await chromium.launch();
const pages = [];
async function persona(cookieValue, { admin = false, viewport = { width: 1280, height: 900 } } = {}) {
  const context = await browser.newContext({ baseURL: target, viewport });
  const cookies = [];
  if (cookieValue) cookies.push({ name: "__Host-rs_session", value: cookieValue, domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
  if (admin) cookies.push({ name: "cohere_session", value: adminToken, url: target, httpOnly: true, sameSite: "Lax" });
  if (cookies.length) await context.addCookies(cookies);
  const page = await context.newPage();
  page.on("pageerror", (e) => fail(`uncaught page error — ${e}`));
  pages.push(page);
  return { context, page };
}
const feed = async (page, path = "/board") => {
  await page.goto(path, { waitUntil: "networkidle" });
};
const posts = (page) => page.getByTestId("board-post");

try {
  // ── 1. the gate ───────────────────────────────────────────────────────────
  step = "gate";
  const out = await persona(null);
  await feed(out.page);
  await out.page.locator('[data-gate="signed-out"]').waitFor({ timeout: 15_000 });
  expect((await posts(out.page).count()) === 0, "signed out: no posts rendered");
  expect(!(await out.page.getByText("Spare squash").count()), "signed out: no post text in the page");
  const outsider = await persona("mock-outsider");
  await feed(outsider.page);
  await outsider.page.locator('[data-gate="not-member"]').waitFor({ timeout: 15_000 });
  expect(!(await outsider.page.getByText("Spare squash").count()) && (await posts(outsider.page).count()) === 0, "signed in but not a member: the gate, not an empty board");
  const direct = await outsider.page.evaluate(async () => (await (await fetch("/xrpc/social.scenius.listCirclePosts?collective=did:plc:mockscene")).json()).records.length);
  expect(direct === 0, "the proxy gives a non-member an empty page");

  // ── 2. read, write, reply, delete ─────────────────────────────────────────
  step = "member flow";
  const me = await persona("sess-1");
  const mp = me.page;
  await feed(mp);
  await posts(mp).first().waitFor({ timeout: 15_000 });
  expect((await posts(mp).count()) === 3, "member sees the 3 seeded root posts (the reply is not a feed row)");
  expect(await mp.getByText("Spare squash").isVisible(), "seeded post text is shown");
  expect(await mp.getByText("1 reply").count() === 1, "the ride post shows its reply count");
  await mp.getByRole("button", { name: "#harvest" }).click();
  expect((await posts(mp).count()) === 1, "the #harvest filter narrows the feed");
  await mp.getByRole("button", { name: /^Everything/ }).click();

  const title = `Bikes to the barn ${stamp}`;
  await mp.getByRole("button", { name: "Write a post" }).filter({ visible: true }).first().click();
  await mp.getByRole("button", { name: "Post to the board" }).click();
  await mp.getByText("Write something first.").first().waitFor();
  ok("posting nothing is refused inline");
  await mp.locator("#c-title").fill(title);
  await mp.locator("#c-text").fill(`Meeting at the barn at nine ${stamp}`);
  await mp.getByRole("button", { name: "#rideshare" }).click();
  await mp.getByRole("button", { name: "Post to the board" }).click();
  await mp.getByText(title).first().waitFor({ timeout: 10_000 });
  ok("a new post appears on the feed");
  await mp.locator("article.post--own", { hasText: title }).waitFor();
  ok("your own post carries the You mark");

  await mp.getByRole("link", { name: title }).click();
  await mp.waitForURL(/\/board\/did(:|%3A)plc(:|%3A)mockuser\/.+/);
  await mp.locator("#rt").fill(`Count me in ${stamp}`);
  await mp.getByRole("button", { name: "Post reply" }).click();
  await mp.getByText(`Count me in ${stamp}`).waitFor({ timeout: 10_000 });
  ok("a reply lands in the thread");

  await mp.getByRole("button", { name: "Delete" }).first().click();
  await mp.getByRole("button", { name: "Delete", exact: true }).last().click();
  await mp.waitForURL(/\/board$/, { timeout: 10_000 }).catch(() => {});
  await feed(mp);
  expect(!(await mp.getByText(title).count()), "deleting your own post removes it");

  // ── 3. report ─────────────────────────────────────────────────────────────
  step = "report";
  const peerPostText = "Spare squash, a lot of it. Come get some.";
  await mp.getByTestId("board-post").filter({ hasText: peerPostText }).getByRole("button", { name: "Report" }).click();
  await mp.getByRole("button", { name: "Send report" }).click();
  await mp.getByText("Pick a reason.").first().waitFor();
  ok("a report without a reason is refused inline");
  await mp.getByRole("button", { name: "Spam" }).click();
  await mp.locator("#rp-note").fill(`selling squash ${stamp}`);
  await mp.getByRole("button", { name: "Send report" }).click();
  await mp.getByText("Thanks — a steward will look.").waitFor({ timeout: 10_000 });
  ok("the reporter sees a thank-you");
  expect(await mp.getByText(peerPostText).isVisible(), "nothing changes for the feed after a report");
  const spoof = await mp.evaluate(async () => (await fetch("/api/board/reports", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ uri: "at://did:plc:mockpeer/coop.lexicon.post/zzz", reason: "other", reporter: "did:plc:mockpeer" }),
  })).status);
  expect(spoof === 200, "a body-supplied reporter is simply ignored (the report is filed under the session DID)");
  const anon = await out.page.evaluate(async () => (await fetch("/api/board/reports", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uri: "at://did:plc:x/coop.lexicon.post/a", reason: "spam" }),
  })).status);
  expect(anon === 401, "reporting while signed out is a 401");
  const strange = await outsider.page.evaluate(async () => (await fetch("/api/board/reports", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uri: "at://did:plc:x/coop.lexicon.post/a", reason: "spam" }),
  })).status);
  expect(strange === 403, "a signed-in non-member cannot report (403)");

  // ── 4. the admin tab: hide / unhide ───────────────────────────────────────
  step = "admin hide";
  const admin = await persona(null, { admin: true });
  const ap = admin.page;
  ap.on("dialog", (d) => d.accept(d.type() === "prompt" ? `e2e note ${stamp}` : undefined));
  await ap.goto("/admin", { waitUntil: "networkidle" });
  await ap.getByRole("tab", { name: /^Board/ }).click();
  const row = ap.locator("#boardreports tr", { hasText: "Spare squash" });
  await row.waitFor({ timeout: 10_000 });
  expect((await row.innerText()).includes(`selling squash ${stamp}`), "the Board tab shows the report with its reason and note");
  expect(await ap.locator("#boardapproval").isChecked() === false, "approval is off by default");
  await row.getByRole("button", { name: "Hide" }).click();
  await ap.locator("#boardhidden tr", { hasText: "Spare squash" }).waitFor({ timeout: 10_000 });
  ok("Hide moves the post to the hidden list");

  await feed(mp);
  expect(!(await mp.getByText(peerPostText).count()), "hidden: other members no longer see it");
  const viaProxy = await mp.evaluate(async () => JSON.stringify(await (await fetch("/xrpc/social.scenius.listCirclePosts?collective=did:plc:mockscene")).json()));
  expect(!viaProxy.includes("Spare squash"), "hidden: a direct proxy call cannot get it either");
  const peer = await persona("mock-peer");
  await feed(peer.page);
  const own = peer.page.getByTestId("board-post").filter({ hasText: peerPostText });
  await own.waitFor({ timeout: 10_000 });
  expect((await own.getByTestId("mod-mark").innerText()).includes("Hidden by a steward"), "the author still sees it, marked 'Hidden by a steward'");

  await ap.locator("#boardhidden tr", { hasText: "Spare squash" }).getByRole("button", { name: "Unhide" }).click();
  await ap.locator("#boardhidden tr", { hasText: "Nothing hidden." }).waitFor({ timeout: 10_000 });
  await feed(mp);
  expect(await mp.getByText(peerPostText).isVisible(), "Unhide brings it back for everyone");

  // ── 5. remove (permanent) ─────────────────────────────────────────────────
  step = "admin remove";
  const gratitude = "Gracias a todas las personas";
  const reportResult = await mp.evaluate(async () => {
    const list = await (await fetch("/xrpc/social.scenius.listCirclePosts?collective=did:plc:mockscene&tag=gratitude")).json();
    const uri = list.records[0].uri;
    const res = await fetch("/api/board/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uri, reason: "private_info", excerpt: "Gracias a todas las personas" }) });
    return res.status;
  });
  expect(reportResult === 200, "reported a second post");
  await ap.getByRole("tab", { name: /^Board/ }).click();
  await ap.reload({ waitUntil: "networkidle" });
  await ap.getByRole("tab", { name: /^Board/ }).click();
  const rmRow = ap.locator("#boardreports tr", { hasText: gratitude });
  await rmRow.waitFor({ timeout: 10_000 });
  await rmRow.getByRole("button", { name: "Remove" }).click();
  const removed = ap.locator("#boardhidden tr", { hasText: gratitude });
  await removed.waitFor({ timeout: 10_000 });
  expect((await removed.innerText()).includes("permanent") && !(await removed.getByRole("button", { name: "Unhide" }).count()), "a removed post offers no Unhide");
  const redo = await ap.evaluate(async () => {
    const uri = (await (await fetch("/api/admin/board")).json()).hidden[0].uri;
    return (await fetch("/api/admin/board/unhide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uri }) })).status;
  });
  expect(redo === 409, "unhiding a removed post is refused (409)");
  await feed(mp);
  expect(!(await mp.getByText(gratitude).count()), "removed: gone for members");

  // ── 6. the approval hook ──────────────────────────────────────────────────
  step = "approval";
  const mark = async (page) => page.evaluate(async () => (await fetch("/api/admin/board/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ approval: true }) })).status);
  expect((await mark(ap)) === 200, "approval switched on");
  const created = await peer.page.evaluate(async (text) => {
    const res = await fetch("/xrpc/social.scenius.createCirclePost", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ collective: "did:plc:mockscene", post: { text, createdAt: new Date(Date.now() + 2000).toISOString() } }) });
    return res.status;
  }, `Held post ${stamp}`);
  expect(created === 200, "the peer wrote a post");
  await feed(mp);
  expect(!(await mp.getByText(`Held post ${stamp}`).count()), "held: other members do not see a new post from a non-steward");
  await feed(peer.page);
  const held = peer.page.getByTestId("board-post").filter({ hasText: `Held post ${stamp}` });
  await held.waitFor({ timeout: 10_000 });
  expect((await held.getByTestId("mod-mark").innerText()).includes("Waiting for a steward"), "the author sees their post marked as waiting");
  await ap.reload({ waitUntil: "networkidle" });
  await ap.getByRole("tab", { name: /^Board/ }).click();
  const pend = ap.locator("#boardpending tr", { hasText: `Held post ${stamp}` });
  await pend.waitFor({ timeout: 10_000 });
  await pend.getByRole("button", { name: "Approve" }).click();
  await ap.locator("#boardpending tr", { hasText: "Nothing is waiting." }).waitFor({ timeout: 10_000 });
  await feed(mp);
  await mp.getByText(`Held post ${stamp}`).waitFor({ timeout: 10_000 });
  ok("Approve lets the post through for everyone");
  await ap.locator("#boardapproval").uncheck();
  await ap.waitForTimeout(400);

  // ── 7. the proxy only lends our collective ────────────────────────────────
  step = "collective pin";
  const other = await mp.evaluate(async () => (await fetch("/xrpc/social.scenius.listCirclePosts?collective=did:plc:other")).status);
  expect(other === 400, "a different collective is refused (400)");

  // ── 8. Spanish, phone ─────────────────────────────────────────────────────
  step = "spanish and phone";
  await feed(mp);
  await mp.getByRole("button", { name: "Es", exact: true }).filter({ visible: true }).first().click();
  await mp.getByRole("heading", { name: "Foro" }).waitFor();
  await mp.getByRole("button", { name: "Escribir un mensaje" }).filter({ visible: true }).first().waitFor();
  ok("the Board speaks Spanish");
  const phone = await persona("sess-1", { viewport: { width: 390, height: 844 } });
  await feed(phone.page);
  await posts(phone.page).first().waitFor({ timeout: 15_000 });
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow <= 0, "390px: no horizontal scroll");
  expect(await phone.page.locator(".actionbar").getByRole("button", { name: "Write a post" }).isVisible(), "390px: the pinned Write a post bar is shown");
} catch (error) {
  fail(`unexpected: ${error}`);
  for (const [i, p] of pages.entries()) await p.screenshot({ path: `/tmp/board-e2e-fail-${i}.png`, fullPage: true }).catch(() => {});
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nboard-e2e passed");
