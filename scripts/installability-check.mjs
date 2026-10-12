// Asks Chromium (DevTools protocol) whether the manifest + service worker make the
// app installable, and prints the manifest's own warnings. Local preview only.
//   npx vite preview --port 4173 & node scripts/installability-check.mjs http://127.0.0.1:4173
import { chromium } from 'playwright';
const base = process.argv[2];
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Run against a local preview');
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${base}/today`, { waitUntil: 'networkidle' });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'networkidle' });
const cdp = await page.context().newCDPSession(page);
const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
const { url, errors, data } = await cdp.send('Page.getAppManifest');
const m = JSON.parse(data);
console.log('manifest', url);
console.log('manifest parse errors:', JSON.stringify(errors));
console.log('id', m.id, '| icons', m.icons.map((i) => `${i.sizes}:${i.purpose}`).join(', '), '| screenshots', m.screenshots.map((s) => s.form_factor).join(','));
console.log('installability errors:', JSON.stringify(installabilityErrors));
await browser.close();
process.exit(installabilityErrors.length || errors.some((e) => e.fatal) ? 1 : 0);
