// Local mock only. Usage: node scripts/slice2-screenshots.mjs http://127.0.0.1:33501
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const base = process.argv[2];
if (!base || !['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use the local regenOS mock');
const out = '/home/uni/.hermes/cache/scratch/slice2-shots';
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
for (const signedIn of [false, true]) {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}/events`, { waitUntil: 'networkidle' });
  if (signedIn) {
    await context.request.post(`${base}/xrpc/social.scenius.beginSignup`, { data: { email: 'screenshots@example.test' } });
    await page.goto(`${base}/login?token=tok-good`, { waitUntil: 'networkidle' });
    await page.getByLabel('Handle', { exact: true }).fill('tester');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await page.waitForURL('**/events');
  }
  for (const [width, height] of [[390,844],[800,1067],[1067,800],[1280,800]]) {
    await page.setViewportSize({ width, height });
    for (const lang of ['en','es']) {
      for (const route of ['events','board']) {
        await page.goto(`${base}/${route}`, { waitUntil: 'networkidle' });
        if (lang === 'es') await page.getByRole('button', { name: 'En/Es' }).filter({ visible: true }).click();
        if (width >= 768 && !await page.getByTestId('header-tabs').isVisible()) throw new Error('Header tabs hidden');
        if (signedIn && width === 390) {
          const account = page.getByRole('button', { name: 'tester.mock.test', exact: true });
          await account.click();
          await page.getByRole('menu').getByText('tester.mock.test', { exact: true }).waitFor();
          await page.keyboard.press('Escape');
          await page.getByRole('menu').waitFor({ state: 'detached' });
          if (await page.getByTestId('nav-handle').first().isVisible()) throw new Error('Phone handle should be icon only');
        }
        // Check sticky-header colour throughout the page, including over the footer.
        for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
          await page.evaluate(f => window.scrollTo(0, f * document.documentElement.scrollHeight), fraction);
          const valid = await page.getByTestId('header-wordmark').evaluate(el => {
            const probe = document.createElement('span');
            probe.style.color = 'hsl(var(--brand-deep))';
            document.body.append(probe);
            const expected = getComputedStyle(probe).color;
            probe.remove();
            return getComputedStyle(el).color === expected && el.getBoundingClientRect().width > 0;
          });
          if (!valid) throw new Error(`Header wordmark colour/visibility: ${width}, ${lang}, ${route}, ${signedIn}, ${fraction}`);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        const contrast = await page.locator('footer button[type="submit"]').evaluate(el => {
          const style = getComputedStyle(el);
          const luminance = colour => {
            const channels = colour.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
              const c = v / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const a = luminance(style.color), b = luminance(style.backgroundColor);
          return style.backgroundImage === 'none' && Number(style.opacity) === 1
            ? (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) : 0;
        });
        if (contrast < 4.5) throw new Error(`Footer button contrast: ${contrast}`);
        const stem = `${signedIn ? 'in' : 'out'}-${route}-${width}x${height}-${lang}`;
        await page.screenshot({ path: `${out}/${stem}.png`, fullPage: true });
        if (signedIn && width === 390) {
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          await page.screenshot({ path: `${out}/${stem}-bottom.png`, fullPage: false });
          const clear = await page.evaluate(() => {
            const footer = document.querySelector("footer").getBoundingClientRect();
            const bar = document.querySelector(".app-bottom-tabs").getBoundingClientRect();
            return footer.bottom <= bar.top && getComputedStyle(document.body).backgroundColor === getComputedStyle(document.querySelector("footer")).backgroundColor;
          });
          if (!clear) throw new Error(`Footer covered or mismatched padding: ${stem}`);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        if (width === 800) {
          await page.addStyleTag({ content: 'html { filter: grayscale(1); }' });
          await page.screenshot({ path: `${out}/${stem}-gray.png`, fullPage: true });
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (overflow) throw new Error(`Horizontal overflow: ${stem}`);
      }
    }
  }
  if (!signedIn) {
    await page.setViewportSize({ width:390, height:844 });
    for (const lang of ['en','es']) {
      await page.goto(`${base}/board`, { waitUntil:'networkidle' });
      if (lang === 'es') await page.getByRole('button', { name:'En/Es' }).filter({ visible:true }).click();
      await page.getByRole('button', { name:lang === 'es' ? 'Únete a COhere' : 'Join COhere', exact:true }).click();
      await page.waitForTimeout(300);
      const close = await page.getByRole('dialog').getByRole('button', { name: lang === 'es' ? 'Cerrar diálogo' : 'Close dialog' }).boundingBox();
      if (!close || close.width < 44 || close.height < 44) throw new Error('Dialog close target too small');
      await page.screenshot({ path:`${out}/dialog-390-${lang}.png`, fullPage:true });
      await page.keyboard.press('Escape');
      await context.request.post(`${base}/xrpc/social.scenius.beginSignup`, { data:{ email:'handle@example.test' } });
      await page.goto(`${base}/login?token=tok-good`, { waitUntil:'networkidle' });
      if (lang === 'es') await page.getByRole('button', { name:'En/Es' }).filter({ visible:true }).click();
      await page.locator('#signup-handle').fill('firefly');
      await page.screenshot({ path:`${out}/handle-390-${lang}.png`, fullPage:true });
    }
  }
  await context.close();
}
await browser.close();
console.log(`Saved 44 full-page and 4 viewport-bottom screenshots to ${out}`);
