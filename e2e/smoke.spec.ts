import { expect, test } from '@playwright/test';

/** The app decides its language from the browser, so pin it for assertions. */
test.use({ locale: 'en-GB' });

test('a run survives being started, shopped and reloaded', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(message.text());
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Start Run' }).click();
  await expect(page.getByRole('heading', { name: /Red Deck · White/ })).toBeVisible();

  // Declaring a hand drives both the strategy panel and the score estimate.
  await page.getByLabel('Hand you build around').selectOption('Flush');
  await expect(page.locator('.score-panel')).toContainText('Typical Flush');
  await expect(page.locator('.strategy')).toContainText('Flush');

  // Money is committed on blur, not per keystroke.
  const money = page.getByRole('spinbutton', { name: 'Money $' }).first();
  await money.fill('30');
  await money.blur();

  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  await page.getByPlaceholder('Add shop card…').fill('blueprint');
  await page.keyboard.press('Enter');

  const advice = page.locator('.recs > li').first();
  await expect(advice).toContainText('Blueprint');
  await expect(advice).toContainText('score');

  // Buying moves money and the card off the shop draft.
  await page.getByRole('button', { name: 'Bought', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Money $' }).first()).toHaveValue('20');

  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Jokers \(1\/5\)/ })).toBeVisible();

  // A real reload, through the real localStorage.
  await page.reload();
  await expect(page.getByRole('heading', { name: /Jokers \(1\/5\)/ })).toBeVisible();
  await expect(page.getByLabel('Hand you build around')).toHaveValue('Flush');

  // Undo walks the purchase back, money included.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: /Jokers \(0\/5\)/ })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Money $' }).first()).toHaveValue('30');

  expect(failures).toEqual([]);
});

test('the language switch survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Language').selectOption('de');
  await expect(page.getByRole('button', { name: 'Run starten' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Run starten' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});

test('the app serves its offline shell after a first load', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Run' }).click();
  await expect(page.getByRole('heading', { name: /Red Deck/ })).toBeVisible();

  // Wait for the service worker to actually control the page. Going offline
  // before it has claimed the client is a race, and reloading then fails with
  // ERR_INTERNET_DISCONNECTED regardless of whether the app is really offline
  // capable. If this never resolves, the offline promise is genuinely broken.
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 });

  // The run lives in localStorage, so it must come back without the network.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Red Deck/ })).toBeVisible();
});
