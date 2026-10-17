// Puts the guide's raw phone screenshots (scripts/guide-capture.mjs) into plain phone frames, and makes a
// contact sheet. A frame is a dark rounded bezel only: no fake status bar or browser chrome, since those
// would pretend to be a real phone.
//
//   node scripts/guide-frame.mjs <guide-dir>
//   → <guide-dir>/steps/NN-name.png (iPhone, English), steps/es/…, steps/android/…, contact-sheet.png
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const [dir] = process.argv.slice(2);
if (!dir) { console.error("usage: node scripts/guide-frame.mjs <guide-dir>"); process.exit(2); }
const SETS = { "iphone-en": ["steps", 390, 844], "iphone-es": ["steps/es", 390, 844], "android-en": ["steps/android", 412, 915] };
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
const frameHtml = (src, w, h) => `<!doctype html><html><body style="margin:0;background:transparent">
<div id="f" style="display:inline-block;padding:12px;border-radius:52px;background:#1d2622;box-shadow:inset 0 0 0 2px #3a4640">
<img src="${src}" style="display:block;width:${w}px;height:${h}px;border-radius:40px"></div></body></html>`;

const framed = [];
for (const [set, [sub, w, h]] of Object.entries(SETS)) {
  let files;
  try { files = (await readdir(`${dir}/raw/${set}`)).filter((f) => f.endsWith(".png")).sort(); } catch { continue; }
  await mkdir(`${dir}/${sub}`, { recursive: true });
  for (const f of files) {
    const data = `data:image/png;base64,${(await readFile(`${dir}/raw/${set}/${f}`)).toString("base64")}`;
    await page.setContent(frameHtml(data, w, h));
    await page.locator("img").evaluate((img) => img.decode());
    const target = `${dir}/${sub}/${f}`;
    await page.locator("#f").screenshot({ path: target, omitBackground: true });
    // 256 colours keeps the screens crisp and the files small enough for git and email.
    execFileSync("magick", [target, "-colors", "256", "-strip", `PNG8:${target}`]);
    if (set === "iphone-en") framed.push(f);
  }
}

// Contact sheet: the English iPhone steps, five across, with their file names.
const tiles = await Promise.all(framed.map(async (f) => `<figure><img src="data:image/png;base64,${(await readFile(`${dir}/steps/${f}`)).toString("base64")}"><figcaption>${f}</figcaption></figure>`));
await page.setViewportSize({ width: 1500, height: 900 });
await page.setContent(`<!doctype html><html><body style="margin:0;padding:28px;background:#f3eee2;font:15px system-ui,sans-serif;color:#1e3d33">
<h1 style="font:600 26px Georgia,serif;margin:0 0 20px">COhere app guide: iPhone screens (English)</h1>
<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:22px">${tiles.join("")}</div>
<style>figure{margin:0;text-align:center}img{width:100%;height:auto}figcaption{margin-top:6px}</style></body></html>`);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
await page.screenshot({ path: `${dir}/contact-sheet.png`, fullPage: true });
await browser.close();
execFileSync("magick", [`${dir}/contact-sheet.png`, "-resize", "50%", "-colors", "256", "-strip", `PNG8:${dir}/contact-sheet.png`]);
console.log(`guide-frame: ${framed.length} English iPhone steps framed, plus es/android; contact sheet written`);
