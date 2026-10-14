// Renders the manifest's store screenshots from the same mocked real-event data
// as redesign-e2e.mjs. Local preview only.
//   npx vite preview --port 4173 &  node scripts/pwa-store-shots.mjs http://127.0.0.1:4173
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.argv[2];
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Run against a local preview');
const out = new URL('../public/screenshots/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const calendar = JSON.parse(readFileSync(new URL('./fixtures/community-events.json', import.meta.url), 'utf8'));
const DAY3 = { title: "Learn three neighbours' names", body: 'Today is a good day to be out among people, with the Free Market and the Resilience Skill Share on the calendar. Wherever you wander, learn the names of three living things nearby. A tree, a bird, a weed, a person at the next table all count. Say each name out loud once.', question: 'Who or what around you has been here longer than you have?' };
const MINE = ['ev-mumxh6xexaec9p', 'ev-muzqdy1u843029', 'ev-mu0a3o6vuz2kto', 'ev-mulky5aynaswjj'];
const store = { v: 1, items: MINE.map((rkey, i) => ({ did: 'did:plc:w54s52ycbw5lreyhlzexredb', rkey, source: 'email', at: new Date(Date.UTC(2026, 9, 10, 12, i)).toISOString() })) };
const browser = await chromium.launch();
async function shoot(file, route, viewport, scale) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, serviceWorkers: 'block' });
  await context.clock.setFixedTime(new Date('2026-10-17T15:40:00Z'));
  const page = await context.newPage();
  await page.route('**/api/**', (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/companion/today') return r.fulfill({ json: { date: '2026-10-17', daily: DAY3, quests: [], pushKey: null, start: '2026-10-15', end: '2026-10-25' } });
    if (path === '/api/events') return r.fulfill({ json: calendar });
    if (path === '/api/config') return r.fulfill({ json: { regenosLoginEnabled: false } });
    return r.fulfill({ status: 404, json: {} });
  });
  await page.addInitScript(({ store }) => { localStorage.setItem('cohere.myEvents.v1', JSON.stringify(store)); localStorage.setItem('cohere-practice-done', JSON.stringify(['2026-10-15', '2026-10-16'])); }, { store });
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out + file });
  await context.close();
}
await shoot('today-narrow.png', '/today', { width: 360, height: 780 }, 3);
await shoot('calendar-narrow.png', '/calendar', { width: 360, height: 780 }, 3);
await shoot('today-wide.png', '/today', { width: 1280, height: 720 }, 1.5);
await browser.close();
console.log('wrote', out);
