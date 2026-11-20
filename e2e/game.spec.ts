import { test, expect } from '@playwright/test';
import { as, open } from './helpers';

test.describe('as a first-year', () => {
  test.use(as('sneha'));

test('ticking off tasks shows XP and, past the daily goal, a celebration', async ({ page }) => {
  await open(page, '/tasks');

  const tick = page.locator('button[aria-label^="Mark"]');
  await expect(tick.first()).toBeVisible();

  await tick.first().click();
  await expect(page.getByText(/^\+\d+ XP$/).first()).toBeVisible();

  // Keep going until the goal is met; the celebration screen appears.
  for (let i = 0; i < 5; i += 1) {
    if (await page.getByRole('button', { name: 'CONTINUE' }).isVisible().catch(() => false)) break;
    await tick.first().click();
    await page.waitForTimeout(600);
  }
  await expect(page.getByRole('heading', { name: 'Daily goal reached!' })).toBeVisible();
  await page.getByRole('button', { name: 'CONTINUE' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
});

test.describe('as a senior', () => {
  test.use(as('priya'));

test('the Path page shows level, quests, the season path, and achievements', async ({ page }) => {
  await open(page, '/path');
  await expect(page.getByRole('heading', { name: 'Your season path' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daily quests' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Achievements' })).toBeVisible();
  await expect(page.getByText('Next', { exact: true })).toBeVisible();
});

test('the weekly league shows a podium', async ({ page }) => {
  await open(page, '/leaderboard');
  await expect(page.getByLabel("This week's top three")).toBeVisible();
});
});
