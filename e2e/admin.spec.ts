import { test, expect } from '@playwright/test';
import { as, open } from './helpers';

test.describe('as an admin', () => {
  test.use(as('admin'));

test('an admin changes a role, and the change appears in the audit log', async ({ page }) => {
  await open(page, '/admin');

  await page.getByLabel('Search people').fill('Tanvi');
  await page.getByRole('button', { name: 'Role for Tanvi Rao' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Role', { exact: true }).selectOption('moderator');
  await dialog.getByLabel('Note for the record').fill('Runs the consult club');
  await page.getByRole('button', { name: 'Save role' }).click();
  await expect(page.getByText('Role updated')).toBeVisible();

  await page.getByRole('tab', { name: 'Audit log' }).click();
  const trail = page.getByRole('main');
  await expect(trail.getByText(/Changed a role — Tanvi Rao/).first()).toBeVisible();
  await expect(trail.getByText(/Student → Moderator/).first()).toBeVisible();
});

});

test.describe('as a student', () => {
  test.use(as('sneha'));

test('a student cannot reach the admin console or its API', async ({ page }) => {
  await open(page, '/admin');
  await expect(page.getByText('Admins only')).toBeVisible();
  const response = await page.request.get('/api/admin/users');
  expect(response.status()).toBe(403);
});
});
