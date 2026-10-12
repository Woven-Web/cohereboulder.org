// Browser check for the Almanac × Trail Today + Calendar screens (T-113), run
// against a built site with every API mocked from real event data
// (scripts/fixtures/community-events.json). Nothing here touches production.
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/redesign-e2e.mjs http://127.0.0.1:4173 [/dir/for/screenshots]
//
// Asserts: "I did it" is fully inside the viewport at 360×780 and 390×844; no
// horizontal overflow at 360/390/1200/1600; every running animation is finite
// (with and without reduced motion); trail targets are ≥44px with accessible
// names; the install sheet is offered once and "Not now" sticks; the pre-festival
// Today shows a labelled sample and never "not available yet"; Spanish renders.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.argv[2];
const shots = process.argv[3];
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Run against a local preview');
if (shots) await mkdir(shots, { recursive: true });

const calendar = JSON.parse(readFileSync(new URL('./fixtures/community-events.json', import.meta.url), 'utf8'));
const DAY3 = {
  title: "Learn three neighbours' names",
  title_es: 'Aprende tres nombres del lugar',
  body: 'Today is a good day to be out among people, with the Free Market and the Resilience Skill Share on the calendar. Wherever you wander, learn the names of three living things nearby. A tree, a bird, a weed, a person at the next table all count. Say each name out loud once.',
  body_es: 'Hoy es buen día para estar entre la gente, con el Mercado Libre y el intercambio de habilidades de resiliencia en el calendario. Por donde andes, aprende el nombre de tres seres vivos cercanos. Vale un árbol, un pájaro, una maleza o la persona de la mesa de al lado. Di cada nombre en voz alta una vez.',
  question: 'Who or what around you has been here longer than you have?',
  question_es: '¿Quién o qué a tu alrededor lleva aquí más tiempo que tú?',
};
const QUEST = { id: 'meet-a-neighbour', title: 'Meet a neighbour', title_es: 'Conoce a un vecino', description: "Introduce yourself to someone on your street or in your building you haven't really talked to. Learn one thing about them.", description_es: 'Preséntate con alguien de tu calle o de tu edificio con quien no hayas hablado de verdad. Descubre algo sobre esa persona.' };
// Four sample RSVPs, as emailed RSVPs (device) and one regenOS seat.
const MINE = ['ev-mumxh6xexaec9p', 'ev-muzqdy1u843029', 'ev-mu0a3o6vuz2kto', 'ev-mulky5aynaswjj'];
const store = { v: 1, items: MINE.map((rkey, i) => ({ did: 'did:plc:w54s52ycbw5lreyhlzexredb', rkey, source: 'email', at: new Date(Date.UTC(2026, 9, 10, 12, i)).toISOString() })) };

const WHEN = { fest: '2026-10-17T15:40:00Z', before: '2026-10-11T14:00:00Z' };
const fails = [];
const ok = (m) => console.log(`PASS ${m}`);
const check = (cond, m) => { if (!cond) { fails.push(m); console.error(`FAIL ${m}`); } else ok(m); };

const browser = await chromium.launch();

async function open({ width, height, when = 'fest', lang = 'en', seed = true, reducedMotion = 'no-preference', installPrompt = false, done = [] }) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, deviceScaleFactor: 1 });
  await context.clock.setFixedTime(new Date(WHEN[when]));
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/companion/today') return route.fulfill({ json: { date: when === 'fest' ? '2026-10-17' : '2026-10-11', daily: when === 'fest' ? DAY3 : null, quests: [QUEST], pushKey: installPrompt ? 'BEl0' : null, start: '2026-10-15', end: '2026-10-25' } });
    if (path === '/api/events') return route.fulfill({ json: calendar });
    if (path.startsWith('/api/events/')) {
      const rkey = decodeURIComponent(path.split('/').pop());
      const event = calendar.events.find((e) => e.rkey === rkey);
      return route.fulfill({ status: event ? 200 : 404, json: { event: event ? { ...event, uris: [], hostName: null } : null, icsUrl: null } });
    }
    if (path === '/api/config') return route.fulfill({ json: { regenosLoginEnabled: false } });
    if (path.startsWith('/api/event-image')) return route.fulfill({ status: 404, body: '' });
    if (path.startsWith('/api/companion/')) return route.fulfill({ json: { ok: true } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.addInitScript(({ store, seed, lang, done }) => {
    if (seed) localStorage.setItem('cohere.myEvents.v1', JSON.stringify(store));
    if (done.length) localStorage.setItem('cohere-practice-done', JSON.stringify(done));
    void lang;
  }, { store, seed, lang, done });
  if (installPrompt) {
    await page.addInitScript(() => {
      window.__installed = false;
      window.addEventListener('DOMContentLoaded', () => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => { window.__prompted = true; };
        event.userChoice = Promise.resolve({ outcome: 'accepted' });
        window.dispatchEvent(event);
      });
    });
  }
  return { context, page, errors };
}

async function setLang(page, lang) {
  if (lang === 'es') await page.getByRole('group', { name: /Language|Idioma/ }).getByRole('button', { name: 'Es', exact: true }).click();
}

async function noOverflow(page, label) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(over <= 0, `no horizontal overflow ${label} (${over}px)`);
}

async function finiteAnimations(page, label) {
  const infinite = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).map((a) => a.animationName || a.constructor.name));
  check(infinite.length === 0, `every animation is finite ${label}${infinite.length ? ': ' + infinite.join(',') : ''}`);
}

async function inViewport(page, locator, label) {
  const box = await locator.boundingBox();
  const vp = page.viewportSize();
  const covered = await locator.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !(hit === el || el.contains(hit)); });
  check(box && box.y >= 0 && box.y + box.height <= vp.height && box.x >= 0 && box.x + box.width <= vp.width && !covered, `"I did it" fully visible and unobstructed ${label} (y ${box && Math.round(box.y)}–${box && Math.round(box.y + box.height)} of ${vp.height})`);
}

const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: name.includes('full') }); };

// ───────────────────────────── Today, festival day 3 ─────────────────────────────
for (const [w, h] of [[360, 780], [390, 844]]) {
  const { context, page, errors } = await open({ width: w, height: h, installPrompt: true, done: ['2026-10-15', '2026-10-16'] });
  await page.goto(`${base}/today`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: DAY3.title, level: 1 }).waitFor();
  const btn = page.getByRole('button', { name: 'I did it', exact: true });
  await inViewport(page, btn, `${w}×${h}`);
  check((await page.getByTestId('folio').innerText()).startsWith('Day 3 of 11 · Sat Oct 17'), `folio reads Day 3 of 11 · Sat Oct 17 at ${w}`);
  check((await page.getByRole('link', { name: /Saturday Oct 17, today/ }).count()) === 1, `trail names today ("Saturday Oct 17, today") at ${w}`);
  check((await page.getByRole('link', { name: /Thursday Oct 15, practice done/ }).count()) === 1, `trail marks a finished day done at ${w}`);
  const hexes = await page.getByTestId('app-tabs').evaluate(() => [...document.querySelectorAll('.trail--fit .trail__day')].map((a) => { const r = a.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check(hexes.length === 11 && hexes.every(([a, b]) => a >= 44 && b >= 44), `fit-trail targets are ≥44×44 at ${w} (${JSON.stringify(hexes[0])})`);
  await noOverflow(page, `Today ${w}`);
  await finiteAnimations(page, `Today ${w}`);
  await shot(page, `today-${w}x${h}`);
  if (w === 390) {
    await shot(page, 'today-full-390x844');
    await btn.click();
    await page.getByTestId('observed-row').waitFor();
    check(await page.getByTestId('action-done').isVisible(), 'pinned bar turns into the Observed confirmation');
    check((await page.getByRole('link', { name: /Saturday Oct 17, today, practice done/ }).count()) === 1, 'today hex fills once the practice is done');
    check(await page.evaluate(() => JSON.parse(localStorage.getItem('cohere-practice-done')).includes('2026-10-17')), 'practice-done is stored on this device');
    const sheet = page.getByRole('dialog', { name: /Keep today’s practice with you/ });
    await sheet.waitFor({ timeout: 4000 });
    await finiteAnimations(page, 'with the install sheet open');
    await shot(page, 'today-install-390x844');
    check(await sheet.getByRole('button', { name: 'Add to home screen & get reminders' }).isVisible(), 'sheet offers the pair "Add to home screen & get reminders"');
    await sheet.getByRole('button', { name: 'Not now' }).click();
    await sheet.waitFor({ state: 'detached' });
    const landed = await page.evaluate(() => { const a = document.activeElement; return { body: a === document.body, inMain: !!a?.closest('main'), what: a?.getAttribute('data-testid') ?? a?.tagName }; });
    check(!landed.body && landed.inMain, `focus returns into the page when the install sheet closes (landed on ${landed.what})`);
    check(await page.evaluate(() => localStorage.getItem('cohere-install-dismissed')) === 'true', '"Not now" is remembered in localStorage');
    await page.getByRole('button', { name: 'Add a thought' }).click();
    await page.getByLabel('Your reply', { exact: true }).fill('Sample reflection');
    await shot(page, 'today-reflect-390x844');
    // Reload: offered once means not again, even on a fresh "I did it" day.
    await page.evaluate(() => localStorage.setItem('cohere-practice-done', '[]'));
    await page.reload({ waitUntil: 'networkidle' });
    // A controlled clock, not a sleep: the offer decision is a 1s timer after the tap.
    await page.clock.install();
    await page.getByRole('button', { name: 'I did it', exact: true }).click();
    await page.getByTestId('observed-row').waitFor();
    await page.clock.runFor(1500);
    check((await page.getByRole('dialog').count()) === 0, 'the install sheet is not offered again after "Not now"');
  }
  check(errors.length === 0, `no page errors on Today ${w}${errors.length ? ': ' + errors[0] : ''}`);
  await context.close();
}

// iOS Safari gets the three-step guide
{
  const { context, page } = await open({ width: 390, height: 844 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' }));
  await page.goto(`${base}/today`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'I did it', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: /Add COhere to your Home Screen/ });
  await sheet.waitFor({ timeout: 4000 });
  check((await sheet.locator('ol.steps > li').count()) === 3, 'iOS Safari gets the 3-step Share guide');
  await shot(page, 'today-install-ios-390x844');
  await context.close();
}

// Wide: two columns
for (const [w, h] of [[1200, 1600], [1600, 1200]]) {
  const { context, page } = await open({ width: w, height: h, done: ['2026-10-15', '2026-10-16'] });
  await page.goto(`${base}/today`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: DAY3.title, level: 1 }).waitFor();
  const [a, b] = await Promise.all([page.locator('.practice').boundingBox(), page.getByTestId('your-next').boundingBox()]);
  check(b.x > a.x + a.width - 2, `Today is two columns at ${w} (practice x ${Math.round(a.x)}, your-next x ${Math.round(b.x)})`);
  check(await page.getByTestId('app-tabs').evaluate((el) => el.getBoundingClientRect().top < 120), `tabs move into the masthead at ${w}`);
  await noOverflow(page, `Today ${w}`);
  await shot(page, `today-${w}x${h}`);
  await finiteAnimations(page, `Today ${w}`);
  await context.close();
}

// Spanish
{
  const { context, page } = await open({ width: 390, height: 844 });
  await page.goto(`${base}/today`, { waitUntil: 'networkidle' });
  await setLang(page, 'es');
  await page.getByRole('heading', { name: DAY3.title_es, level: 1 }).waitFor();
  check(await page.getByRole('button', { name: 'Lo hice', exact: true }).isVisible(), 'Spanish: "Lo hice"');
  check((await page.getByTestId('folio').innerText()).startsWith('Día 3 de 11 · sáb 17 oct'), 'Spanish folio');
  check(await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Agenda' }).isVisible(), 'Spanish tabs: Hoy · Agenda · Foro · Más');
  await inViewport(page, page.getByRole('button', { name: 'Lo hice', exact: true }), 'Spanish 390');
  await noOverflow(page, 'Today es');
  await shot(page, 'today-es-390x844');
  await context.close();
}

// Before the festival: countdown + a labelled sample, never "not available yet"
{
  const { context, page } = await open({ width: 390, height: 844, when: 'before' });
  await page.goto(`${base}/today`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: '4 days until we gather' }).waitFor();
  check(await page.getByTestId('sample-day').getByText('Sample day · Thu Oct 15').isVisible(), 'pre-festival sample is labelled "Sample"');
  check(!(await page.content()).includes('not available yet'), 'never says "not available yet"');
  check((await page.getByRole('button', { name: 'I did it' }).count()) === 0, 'no "I did it" before the festival');
  await noOverflow(page, 'Today before');
  await shot(page, 'today-before-390x844');
  await context.close();
}

// ───────────────────────────── Calendar ─────────────────────────────
for (const [w, h] of [[390, 844], [360, 780], [1200, 1600], [1600, 1200]]) {
  const { context, page, errors } = await open({ width: w, height: h, done: ['2026-10-15', '2026-10-16'] });
  await page.goto(`${base}/calendar`, { waitUntil: 'networkidle' });
  const picker = page.getByRole('listbox', { name: 'Pick a day, Oct 15 to 25' });
  await picker.waitFor();
  const opts = await picker.getByRole('option').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), name: e.getAttribute('aria-label') }; }));
  check(opts.length === 11 && opts.every((o) => o.w >= 44 && o.h >= 44), `day-picker options are ≥44px at ${w}`);
  check(opts.some((o) => o.name === 'Saturday Oct 17, today, 2 of your events'), `option named "Saturday Oct 17, today, 2 of your events" at ${w}`);
  check(await page.getByTestId('my-events-toggle').isVisible(), `My events · All control at ${w}`);
  check((await page.getByTestId('event-card').count()) === 4, `defaults to My events (4 cards) at ${w}`);
  check(await page.getByTestId('your-next').isVisible(), `Your next strip at ${w}`);
  await noOverflow(page, `Calendar ${w}`);
  await finiteAnimations(page, `Calendar ${w}`);
  await shot(page, `calendar-my-${w}x${h}`);
  if (w === 390) {
    {
      // Arrows only move focus. Walking the whole picker in My events must not
      // leave the mode, whatever days have none of your events.
      const picker390 = page.getByRole('listbox', { name: 'Pick a day, Oct 15 to 25' });
      const options = picker390.getByRole('option');
      await options.first().focus();
      let walked = true;
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowRight');
        const focusedIdx = await options.evaluateAll((els) => els.indexOf(document.activeElement));
        if (focusedIdx !== i + 1 || (await page.getByTestId('event-card').count()) !== 4) walked = false;
      }
      check(walked, 'arrow keys across the picker move focus only: still My events (4 cards)');
      check((await page.getByRole('button', { name: /^My events/ }).getAttribute('aria-pressed')) === 'true', 'My events stays selected after the arrows');
      check((await options.evaluateAll((els) => els.filter((e) => e.getAttribute('tabindex') === '0').length)) === 1, 'picker keeps one roving tab stop');
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      check((await page.getByTestId('event-card').count()) !== 4 || (await options.first().getAttribute('aria-selected')) === 'true', 'Enter selects the focused day');
      await page.getByRole('button', { name: /^My events/ }).click();
    }
    await page.getByRole('button', { name: /^All events/ }).click();
    const day = page.getByRole('option', { name: /^Saturday Oct 17/ });
    check((await day.getAttribute('aria-selected')) === 'true', 'All events selects today in the picker');
    check((await page.getByTestId('event-card').count()) === 7, 'Saturday has seven events');
    await shot(page, 'calendar-day-390x844');
    await page.keyboard.press('Tab');
    await day.focus();
    await page.keyboard.press('ArrowRight');
    check((await page.getByRole('option', { name: /^Saturday Oct 17/ }).getAttribute('aria-selected')) === 'true', 'arrow keys alone do not change the selected day');
    await page.keyboard.press('Enter');
    await page.getByRole('option', { name: /^Sunday Oct 18/ }).and(page.locator('[aria-selected=true]')).waitFor();
    ok('arrows move focus and Enter selects a day');
    await page.getByRole('button', { name: 'Show every upcoming date' }).click();
    check((await page.getByTestId('event-card').count()) === 38, 'every upcoming date lists all 38 events');
    await page.getByRole('option', { name: /^Saturday Oct 17/ }).click();
    const first = page.getByTestId('event-card').filter({ hasText: 'Climatique Free Market' });
    check(await first.getByText('Going').count() === 1, 'seat badge on a listed event');
    await first.getByRole('button', { name: 'Add to calendar' }).click();
    check(await page.getByRole('menuitem', { name: 'Google Calendar' }).isVisible(), 'Add to calendar opens the existing menu');
    await page.keyboard.press('Escape');
    await first.getByRole('link', { name: /Climatique Free Market/ }).click();
    await page.getByRole('heading', { level: 1, name: /Climatique Free Market/ }).waitFor();
    check(await page.getByTestId('address-block').isVisible(), 'detail page shows the typographic address block');
    await noOverflow(page, 'Event detail 390');
    await shot(page, 'calendar-event-390x844');
    await finiteAnimations(page, 'Event detail');
  }
  check(errors.length === 0, `no page errors on Calendar ${w}${errors.length ? ': ' + errors[0] : ''}`);
  await context.close();
}
{
  const { context, page } = await open({ width: 1200, height: 1600 });
  await page.goto(`${base}/events/did%3Aplc%3Aw54s52ycbw5lreyhlzexredb/ev-mumxh6xexaec9p`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: /Climatique/ }).waitFor();
  await noOverflow(page, 'Event detail 1200');
  await shot(page, 'calendar-event-1200x1600');
  await context.close();
}
{
  const { context, page } = await open({ width: 390, height: 844, seed: false });
  await page.goto(`${base}/calendar`, { waitUntil: 'networkidle' });
  await page.getByTestId('event-card').first().waitFor();
  check((await page.getByTestId('my-events-toggle').count()) === 0, 'no My events control before any RSVP');
  check((await page.getByTestId('event-card').count()) === 7, 'without RSVPs the picker opens on today');
  await setLang(page, 'es');
  await page.getByRole('listbox', { name: 'Elige un día, 15 al 25 de oct' }).waitFor();
  await noOverflow(page, 'Calendar es');
  await shot(page, 'calendar-es-390x844');
  await context.close();
}
{
  const { context, page } = await open({ width: 390, height: 844, when: 'before', seed: false });
  await page.goto(`${base}/calendar`, { waitUntil: 'networkidle' });
  await page.getByTestId('event-card').first().waitFor();
  check((await page.getByTestId('event-card').count()) === 38, 'before the festival the calendar lists every upcoming date');
  await shot(page, 'calendar-before-390x844');
  await context.close();
}

await browser.close();
if (fails.length) { console.error(`\n${fails.length} check(s) failed:\n- ${fails.join('\n- ')}`); process.exit(1); }
console.log('\nAll redesign checks passed');
