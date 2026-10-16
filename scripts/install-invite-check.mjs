import assert from 'node:assert/strict';

// Shared by the registration/sign-in lane; session belongs to the local mock.
export async function checkInstallInvite(browser, target) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    serviceWorkers: 'block',
  });
  try {
    await context.addCookies([{ name: '__Host-rs_session', value: 'sess-member', domain: '127.0.0.1', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    const title = 'Add COhere to your home screen';
    await page.goto(target + '/?look=ecology');
    await page.getByRole('dialog', { name: title, exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await page.reload();
    await page.waitForTimeout(4000);
    assert.equal(await page.getByRole('dialog', { name: title, exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('cohere-install-dismissed')), 'true');
    // A fresh eligibility state still must not interrupt registration.
    await page.evaluate(() => { localStorage.removeItem('cohere-install-dismissed'); localStorage.removeItem('cohere-install-offered'); });
    await page.goto(target + '/register?look=ecology');
    await page.waitForTimeout(4000);
    assert.equal(await page.getByRole('dialog', { name: title, exact: true }).count(), 0);
  } finally {
    await context.close();
  }
}
