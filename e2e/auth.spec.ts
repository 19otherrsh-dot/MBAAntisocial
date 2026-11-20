import { test, expect } from '@playwright/test';
import { PASSWORD, waitForApp } from './helpers';

test('a new account confirms its year in onboarding, then lands on Today and stays there', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Student');
  await page.getByLabel('Institute email').fill(`e2e-${Date.now()}@iima.ac.in`);
  await page.getByLabel('Password').fill('a-long-password-1');
  await page.locator('select[name=campus]').selectOption('IIM Ahmedabad');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.waitForURL('**/onboarding');
  await page.getByLabel('Year').selectOption('2');
  // Choosing second year offers hosting straight away.
  await expect(page.getByRole('heading', { name: 'Will you host?' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await page.waitForURL('**/home');

  await page.goto('/feed');
  await expect(page).toHaveURL(/\/feed$/);
});

test('a wrong password gets one message that does not reveal whether the account exists', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@iima.ac.in');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('That email and password combination did not work.')).toBeVisible();
});

test('signing in through the form, then signing out, closes the app again', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('priya@iima.ac.in');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/home');
  await waitForApp(page);
  for (let i = 0; i < 3; i += 1) {
    const next = page.getByRole('button', { name: 'CONTINUE' });
    if (await next.isVisible().catch(() => false)) await next.click();
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login**');
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login/);
});
