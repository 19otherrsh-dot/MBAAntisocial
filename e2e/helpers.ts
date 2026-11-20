import { expect, type Page } from '@playwright/test';
import { authFile, type AccountName } from './global-setup';

export const PASSWORD = 'seedpassword123';

/** Use in a `test.use(...)` to run as a seeded account without signing in. */
export const as = (name: AccountName) => ({ storageState: authFile(name) });

/** Opens a signed-in page and waits until the app is live. */
export async function open(page: Page, path = '/home') {
  await page.goto(path);
  await waitForApp(page);
  await dismissCelebrations(page);
}

/**
 * Waits until the signed-in shell is live: the game HUD renders only after the
 * page has hydrated and loaded the account, so clicks after this have handlers.
 */
export async function waitForApp(page: Page) {
  await expect(page.getByRole('link', { name: /daily goal/ })).toBeVisible();
}

/** Clears any celebration screens queued on arrival (a streak milestone, say). */
export async function dismissCelebrations(page: Page) {
  for (let i = 0; i < 4; i += 1) {
    const button = page.getByRole('button', { name: 'CONTINUE' });
    if (!(await button.isVisible().catch(() => false))) return;
    await button.click();
  }
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
