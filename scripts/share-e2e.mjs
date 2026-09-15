import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const origin = process.argv[2] || 'http://localhost:4187';
try {
  for (const mode of ['native', 'abort', 'copy', 'denied', 'native-failure']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript((mode) => {
      window.copied = null;
      window.shared = null;
      Object.defineProperty(navigator, 'share', { configurable: true, value:
        mode === 'copy' || mode === 'denied' ? undefined : async (data) => {
          if (mode === 'abort') throw new DOMException('Cancelled', 'AbortError');
          if (mode === 'native-failure') throw new Error('Unavailable');
          window.shared = data;
        } });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (value) => {
          if (mode === 'denied') throw new Error('Denied');
          window.copied = value;
        }
      } });
    }, mode);
    await page.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('/api/events/') ? {
      event: { did: 'did:plc:test', rkey: 'example', name: 'Community gathering', startsAt: null,
        endsAt: null, description: null, location: null, status: 'cancelled', mode: null,
        uris: [], hostName: null }, icsUrl: null
    } : { regenosLoginEnabled: false } }));
    const path = '/events/did%3Aplc%3Atest/example';
    await page.goto(`${origin}${path}?private=value#fragment`);
    await page.getByRole('button', { name: 'Share event', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button:disabled'));
    const expected = `${origin}${path}`;
    if (mode === 'native') assert.deepEqual(await page.evaluate(() => window.shared), { title: 'Community gathering', url: expected });
    if (mode === 'abort') assert.equal(await page.evaluate(() => window.copied), null);
    if (mode === 'copy' || mode === 'native-failure') {
      await page.getByRole('status').filter({ hasText: 'Link copied' }).waitFor();
      assert.equal(await page.evaluate(() => window.copied), expected);
    }
    if (mode === 'denied') {
      const input = page.getByRole('textbox', { name: 'Event link' });
      await input.waitFor();
      assert.equal(await input.inputValue(), expected);
      await input.focus();
      assert.equal(await input.evaluate(el => el.selectionEnd - el.selectionStart), expected.length);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: 'En/Es', exact: true }).last().click();
    await page.getByRole('button', { name: 'Compartir evento', exact: true }).waitFor();
    if (mode === 'copy') await page.getByRole('status').filter({ hasText: 'Enlace copiado' }).waitFor();
    console.log(`PASS ${mode}: undated, cancelled event; clean URL; mobile layout`);
    await page.close();
  }
} finally { await browser.close(); }
