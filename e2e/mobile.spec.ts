import { test, expect } from '@playwright/test';
import { as, open, expectNoHorizontalScroll } from './helpers';

test.use(as('meera'));

test('every section is reachable on a phone, and nothing scrolls sideways', async ({ page }) => {
  await open(page);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'More' }).click();
  const sheet = page.getByRole('dialog', { name: 'All sections' });
  await expect(sheet).toBeVisible();
  for (const href of ['/intel', '/messages', '/rooms', '/resources', '/whisper-network', '/leaderboard', '/profile']) {
    await expect(sheet.locator(`a[href="${href}"]`)).toBeVisible();
  }

  await sheet.locator('a[href="/messages"]').click();
  await page.waitForURL('**/messages');
  await expectNoHorizontalScroll(page);

  for (const path of ['/path', '/pipeline', '/sessions', '/feed']) {
    await page.goto(path);
    await expectNoHorizontalScroll(page);
  }
});
