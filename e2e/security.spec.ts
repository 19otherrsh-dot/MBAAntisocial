import { test, expect } from '@playwright/test';
import { as, open } from './helpers';

test.describe('as a student', () => {
  test.use(as('sneha'));

test('a session update cannot grant a role', async ({ page }) => {
  await open(page);
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()).csrfToken;
  const updated = await page.request.post('/api/auth/session', {
    data: { csrfToken: csrf, data: { role: 'admin', campus: 'IIM Bangalore' } },
  });
  const session = await updated.json();
  expect(session.user.role).toBe('student');
  expect(session.user.campus).toBe('IIM Ahmedabad');
  expect((await page.request.get('/api/reports')).status()).toBe(403);
});
});

test('security headers are present', async ({ request }) => {
  const response = await request.get('/login');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('the health check reports the database', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect((await response.json()).db).toBe('ok');
});
