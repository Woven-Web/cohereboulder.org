// End-to-end proof of images in the admin newsletter, in a real browser against
// a local wrangler dev + scripts/resend-mock.mjs. Never sends a real email: the
// Worker's RESEND_API_BASE points at the mock, and only "Send me a test" is used.
//
//   1. the upload API refuses the signed-out, a non-image, a too-wide image
//   2. in /admin's composer: Add image → client checks (no file, no alt, wrong
//      type) → a real COhere still (1920 px WebP) is shrunk in the browser to a
//      1200 px JPEG, uploaded, and its line lands where the cursor was
//   3. the preview iframe shows it: absolute URL on PUBLIC_BASE_URL, width
//      attribute, the alt text, and the image actually loaded
//   4. the public URL serves image/jpeg, immutable, nosniff, 1200 px wide
//   5. the test email (at the mock) carries the same <img>; its text part has
//      "[Image: alt] <url>"; an image from another host stays text
//   6. screenshots at 1280 and 390 into the shots dir
//
// Usage (scripts/newsletter-image-e2e.sh does all of this):
//   node scripts/newsletter-image-e2e.mjs <worker-url> <admin-session-token> <resend-mock-url> [shots-dir]

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const target = process.argv[2];
const sessionToken = process.argv[3];
const mockUrl = process.argv[4];
const shots = process.argv[5] ?? "shots-reminders";
if (!target || !sessionToken || !mockUrl) {
  console.error("usage: node scripts/newsletter-image-e2e.mjs <worker-url> <admin-session-token> <resend-mock-url> [shots-dir]");
  process.exit(2);
}
mkdirSync(shots, { recursive: true });

const failures = [];
let step = "";
const ok = (m) => console.log(`ok    ${m}`);
function fail(m) {
  failures.push(`${step}: ${m}`);
  console.error(`FAIL  ${step}: ${m}`);
}
const expect = (c, m) => (c ? ok(m) : fail(m));

/** Width and height from a JPEG's first SOF segment. */
function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
function png(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

const browser = await chromium.launch();
const ALT = "Neighbours gathered in a circle at COhere Boulder";
const PHOTO = "src/assets/photos/gathering.webp"; // a still from the Woven Web films, 1920 × 823
try {
  const context = await browser.newContext({ baseURL: target, viewport: { width: 1280, height: 900 } });
  const api = context.request;
  await api.post(`${mockUrl}/_reset`);

  // ── 1. the API's own refusals ──────────────────────────────────────────
  step = "upload API";
  let res = await api.post("/api/admin/newsletters/images?alt=x", { headers: { Origin: target, "Content-Type": "image/png" }, data: png(800, 600) });
  expect(res.status() === 401, `signed out: ${res.status()}`);
  const cookie = { Cookie: `cohere_session=${sessionToken}`, Origin: target };
  res = await api.post("/api/admin/newsletters/images?alt=x", { headers: { ...cookie, "Content-Type": "image/svg+xml" }, data: Buffer.from("<svg/>") });
  expect(res.status() === 415, `SVG refused: ${res.status()}`);
  res = await api.post("/api/admin/newsletters/images?alt=x", { headers: { ...cookie, "Content-Type": "image/png" }, data: png(1600, 900) });
  expect(res.status() === 400 && /1200 pixels wide/.test((await res.json()).error), `1600 px wide refused: ${res.status()}`);
  res = await api.post("/api/admin/newsletters/images?alt=x", { headers: { ...cookie, "Content-Type": "image/jpeg" }, data: png(800, 600) });
  expect(res.status() === 400, `PNG bytes sent as JPEG refused: ${res.status()}`);
  res = await api.post("/api/admin/newsletters/images", { headers: { ...cookie, "Content-Type": "image/png" }, data: png(800, 600) });
  expect(res.status() === 400, `no alt refused: ${res.status()}`);

  // ── 2. the composer ────────────────────────────────────────────────────
  step = "composer";
  await context.addCookies([{ name: "cohere_session", value: sessionToken, url: target, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => fail(`uncaught page error — ${error}`));
  await page.goto("/admin", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Newsletter", exact: true }).click();
  await page.getByRole("button", { name: "New newsletter" }).click();
  await page.locator("#nlsubject").fill("A week of weaving: photos from the creek");
  const before = "Hello friends,\n\nWhat a first weekend. Here is the opening circle.";
  const after = "See you at the shared meal on Thursday.";
  await page.locator("#nlbody").fill(`${before}\n\n${after}`);
  // Cursor at the end of the first paragraph block, where the image should land.
  await page.locator("#nlbody").evaluate((ta, at) => { ta.focus(); ta.setSelectionRange(at, at); }, before.length);

  await page.getByRole("button", { name: "Add image" }).click();
  const panel = page.getByTestId("nl-image-panel");
  await panel.waitFor({ state: "visible" });
  const msg = page.getByTestId("nl-image-msg");
  await page.getByTestId("nl-image-upload").click();
  expect(/Choose a photo first/.test(await msg.textContent()), "no file → clear error");
  const dir = mkdtempSync(join(tmpdir(), "nl-img-e2e-"));
  const textFile = join(dir, "notes.txt");
  writeFileSync(textFile, "not an image");
  await page.getByTestId("nl-image-file").setInputFiles(textFile);
  await page.getByTestId("nl-image-alt").fill("x");
  await page.getByTestId("nl-image-upload").click();
  await page.getByTestId("nl-image-msg").getByText("Use a JPEG, PNG or WebP image.").waitFor({ timeout: 5_000 });
  ok("a text file → clear type error, nothing uploaded");
  await page.getByTestId("nl-image-file").setInputFiles({ name: "IMG_0412.HEIC", mimeType: "image/heic", buffer: Buffer.from("not really heic") });
  await page.getByTestId("nl-image-upload").click();
  await page.getByTestId("nl-image-msg").getByText("HEIC photo (the iPhone format)").waitFor({ timeout: 5_000 });
  ok("an iPhone HEIC file → says so, and how to save it as JPEG");
  await page.getByTestId("nl-image-file").setInputFiles(PHOTO);
  expect((await msg.textContent()) === "", "choosing another file clears the old error");
  await page.getByTestId("nl-image-alt").fill("");
  await page.getByTestId("nl-image-upload").click();
  expect(/Describe the photo first/.test(await msg.textContent()), "no alt text → clear error");
  await page.getByTestId("nl-image-alt").fill(ALT);
  await page.screenshot({ path: join(shots, "newsletter-image-panel-1280.png"), fullPage: false });
  const uploaded = page.waitForResponse((r) => r.url().includes("/api/admin/newsletters/images") && r.request().method() === "POST");
  await page.getByTestId("nl-image-upload").click();
  const up = await uploaded;
  const upBody = await up.json();
  expect(up.status() === 200, `upload answered ${up.status()}`);
  expect(up.request().headers()["content-type"] === "image/jpeg", `the browser re-encoded the WebP as JPEG (${up.request().headers()["content-type"]})`);
  expect(upBody.width === 1200 && upBody.height === 514, `shrunk to ${upBody.width} × ${upBody.height}`);
  expect(upBody.url.startsWith(`${target}/media/newsletter/`), `URL on PUBLIC_BASE_URL: ${upBody.url}`);
  await panel.waitFor({ state: "hidden" });
  const body = await page.locator("#nlbody").inputValue();
  expect(body === `${before}\n\n![${ALT}](${upBody.url})\n\n${after}`, "the image line went in where the cursor was, as its own block");
  await page.getByTestId("nl-image-hint").waitFor({ state: "visible", timeout: 5_000 });
  ok("a help line says how to move or remove a photo once the text has one");
  expect(/Photo added\. .*move that line to move the photo, delete it to remove it/.test(await page.locator("#nlmsg").textContent()), "the added message says how to move or remove it");

  // Dragging a photo onto the text opens the same panel with that file chosen.
  step = "drag and drop";
  const dropped = await page.locator("#nlbody").evaluate((ta, b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], "dropped.png", { type: "image/png" }));
    const over = new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true });
    ta.dispatchEvent(over);
    const drop = new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true });
    ta.dispatchEvent(drop);
    return { over: over.defaultPrevented, drop: drop.defaultPrevented };
  }, png(800, 600).toString("base64"));
  expect(dropped.over && dropped.drop, "the text box takes the drop (the browser doesn't open the file)");
  await panel.waitFor({ state: "visible", timeout: 5_000 });
  expect(await page.getByTestId("nl-image-file").evaluate((i) => i.files.length === 1 && i.files[0].name === "dropped.png"), "the dropped file is the chosen photo");
  expect(await page.getByTestId("nl-image-alt").evaluate((i) => document.activeElement === i), "the description box has the focus");
  // A second drop replaces the photo: the old description goes, and extra files are named.
  await page.getByTestId("nl-image-alt").fill("words for the first photo");
  await page.locator("#nlbody").evaluate((ta, b64) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bin], "second.png", { type: "image/png" }));
    dt.items.add(new File([bin], "third.png", { type: "image/png" }));
    ta.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, png(800, 600).toString("base64"));
  expect(await page.getByTestId("nl-image-file").evaluate((i) => i.files[0].name === "second.png"), "a second drop replaces the chosen photo");
  expect((await page.getByTestId("nl-image-alt").inputValue()) === "", "…and clears the description written for the first one");
  expect(/Only the first photo was taken/.test(await msg.textContent()), "dropping several photos says only the first was taken");
  await page.locator("#nlimgclose").click();
  await panel.waitFor({ state: "hidden" });
  const elsewhere = await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "stray.png", { type: "image/png" }));
    const drop = new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true });
    document.querySelector("h1, h2, body").dispatchEvent(drop);
    return drop.defaultPrevented;
  });
  expect(elsewhere, "a file dropped elsewhere on the page doesn't replace it");
  expect((await page.locator("#nlbody").inputValue()) === body, "a drop changes nothing in the text until Upload");

  // ── 3. the preview ─────────────────────────────────────────────────────
  step = "preview";
  const frame = page.frameLocator("#nlframe");
  const img = frame.locator(`img[alt="${ALT}"]`);
  await img.waitFor({ timeout: 10_000 });
  expect((await img.getAttribute("src")) === upBody.url, "preview <img> src is the absolute URL");
  expect((await img.getAttribute("width")) === "472", "preview <img> carries width=472 (the mail column)");
  // The iframe is sandboxed (an opaque origin), so ask the frame itself.
  let loaded = 0;
  for (let i = 0; i < 40 && !loaded; i++) {
    loaded = await img.evaluate((el) => (el.complete ? el.naturalWidth : 0)).catch(() => 0);
    if (!loaded) await page.waitForTimeout(250);
  }
  expect(loaded === 1200, `the image loaded inside the sandboxed preview (naturalWidth ${loaded})`);
  // The header is sticky: put the Body label just under it.
  const toTools = () => page.locator("#nltoggle").evaluate((el) => { el.parentElement.scrollIntoView({ block: "start" }); window.scrollBy(0, -80); });
  await toTools();
  await page.screenshot({ path: join(shots, "newsletter-image-1280.png"), fullPage: false });

  // ── 4. the public URL ──────────────────────────────────────────────────
  step = "public image";
  const anon = await browser.newContext();
  const served = await anon.request.get(upBody.url);
  const bytes = Buffer.from(await served.body());
  expect(served.status() === 200 && served.headers()["content-type"] === "image/jpeg", `served ${served.status()} ${served.headers()["content-type"]} without a session`);
  expect(served.headers()["cache-control"] === "public, max-age=31536000, immutable", `cache: ${served.headers()["cache-control"]}`);
  expect(served.headers()["x-content-type-options"] === "nosniff", "nosniff");
  expect(jpegSize(bytes)?.width === 1200, `stored JPEG is ${jpegSize(bytes)?.width} px wide`);
  expect(!bytes.includes(Buffer.from("Exif")), "no EXIF block in the stored file");
  const wrong = await anon.request.get(upBody.url.replace(/-\d+x\d+\.jpg$/, "-1x1.jpg"));
  expect(wrong.status() === 404, `a wrong name is a 404, not the SPA (${wrong.status()})`);
  await anon.close();

  // ── 5. the test email ──────────────────────────────────────────────────
  step = "test email";
  await page.locator("#nlbody").evaluate((ta) => { ta.value += "\n\n![pixel](https://tracker.example/p.gif)"; ta.dispatchEvent(new Event("input")); });
  await page.getByRole("button", { name: "Send me a test" }).click();
  await page.locator("#nlmsg").getByText("Test sent to").waitFor({ timeout: 15_000 });
  const messages = (await (await api.get(`${mockUrl}/_messages`)).json()).messages;
  const mail = messages[messages.length - 1];
  expect(messages.length === 1, `one message at the mock (${messages.length})`);
  expect(mail?.html.includes(`<img src="${upBody.url}" width="472" alt="${ALT}"`), "the email HTML has the <img> with width and alt");
  expect(!mail?.html.includes('src="https://tracker.example'), "an image from another host is not an <img> in the email");
  expect(mail?.text.includes(`[Image: ${ALT}] ${upBody.url}`), "the text part names the image and gives its URL");

  // ── 6. phone width ─────────────────────────────────────────────────────
  step = "390";
  await page.setViewportSize({ width: 390, height: 844 });
  await toTools();
  await page.screenshot({ path: join(shots, "newsletter-image-390-write.png"), fullPage: false });
  await page.getByRole("button", { name: "Add image" }).click();
  await panel.waitFor({ state: "visible" });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(shots, "newsletter-image-panel-390.png"), fullPage: false });
  await page.getByRole("button", { name: "Close" }).click();
  await page.locator('[data-nlview="preview"]').click();
  await page.locator("#nlframe").scrollIntoViewIfNeeded();
  await frame.locator(`img[alt="${ALT}"]`).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.locator("#nlframe").evaluate((f) => { f.scrollIntoView({ block: "start" }); window.scrollBy(0, -110); });
  await frame.locator(`img[alt="${ALT}"]`).evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  await page.screenshot({ path: join(shots, "newsletter-image-390.png"), fullPage: false });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow <= 0, `no sideways scroll at 390 (${overflow}px)`);
} catch (error) {
  fail(`threw: ${error?.stack ?? error}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nnewsletter-image-e2e: all checks passed");
