import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { request, type FullConfig } from '@playwright/test';

export const ACCOUNTS = {
  sneha: 'sneha@iima.ac.in',
  meera: 'meera@iima.ac.in',
  priya: 'priya@iima.ac.in',
  admin: 'admin@iima.ac.in',
} as const;

export type AccountName = keyof typeof ACCOUNTS;
export const authFile = (name: AccountName) => `e2e/.auth/${name}.json`;

/**
 * Rebuilds the demo campus, then signs each test account in once and saves the
 * session. Tests reuse those sessions instead of signing in through the form
 * every time — which would also, correctly, trip the sign-in rate limit.
 */
export default async function globalSetup(config: FullConfig) {
  execSync('npm run seed', { stdio: 'inherit' });

  const baseURL = config.projects[0].use.baseURL!;
  mkdirSync('e2e/.auth', { recursive: true });

  for (const [name, email] of Object.entries(ACCOUNTS) as Array<[AccountName, string]>) {
    const context = await request.newContext({ baseURL });
    const { csrfToken } = await (await context.get('/api/auth/csrf')).json();
    const response = await context.post('/api/auth/callback/credentials', {
      form: { csrfToken, email, password: 'seedpassword123', json: 'true' },
    });
    if (!response.ok()) throw new Error(`Could not sign in ${email}: HTTP ${response.status()}`);
    await context.storageState({ path: authFile(name) });
    await context.dispose();
  }
}
