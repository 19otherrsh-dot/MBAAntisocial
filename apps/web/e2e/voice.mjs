/**
 * Two people join the same hub voice channel through LiveKit and see each
 * other; the hub's participant list (read from LiveKit's server API) agrees.
 * Needs LIVEKIT_* configured on the instance (the integrations workflow runs
 * a dev LiveKit server):
 *
 *   npm run check-voice -w @mba/web
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const problems = [];

async function join(email) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, permissions: ['camera', 'microphone'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${email}: ${e.message}`));
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'seedpassword123');
  await page.click('button[type=submit]');
  await page.waitForURL('**/home');
  await page.goto(`${BASE}/hub`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'study-room', exact: true }).click();
  await page.getByRole('link', { name: 'Join voice' }).click();
  await page.waitForURL(/\/meet\/hub-/);
  await page.getByRole('button', { name: 'Join room' }).click();
  return page;
}

const sneha = await join('sneha@iima.ac.in');
await join('priya@iima.ac.in');
await sneha.locator('.lk-participant-tile').nth(1).waitFor({ timeout: 30_000 });
const names = await sneha.locator('.lk-participant-name').allInnerTexts();
const channelId = sneha.url().split('hub-')[1];
const { participants } = await sneha.evaluate(async (id) => (await fetch(`/api/hub/channels/${id}/voice`)).json(), channelId);
await browser.close();

console.log('Tiles Sneha sees:', names.join(', '));
console.log('Hub participant list:', participants.map((p) => p.name).join(', '));
if (names.length < 2 || participants.length < 2 || problems.length) {
  console.log('Voice check failed.', problems);
  process.exit(1);
}
console.log('Voice works: both people are in the room.');
