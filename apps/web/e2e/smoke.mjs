/**
 * Browser smoke test over the seeded demo campus: the flows that must never
 * break. Run against a seeded instance:
 *
 *   npm run seed -w @mba/web && npm run e2e -w @mba/web            # BASE defaults to http://localhost:3000
 *   BASE=https://staging.example.com npm run e2e -w @mba/web
 *
 * Fails on any uncaught page error or 5xx from the API.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const PASSWORD = 'seedpassword123';
const failures = [];
const problems = [];

async function session(browser, email, viewport = { width: 1360, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`${email} ${page.url()} :: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) problems.push(`${email} ${r.status()} ${r.url()}`);
  });
  if (email) {
    await page.goto(`${BASE}/login`);
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL('**/home', { timeout: 60_000 });
  }
  return page;
}

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    console.log(`  ✓ ${name} (${Date.now() - started}ms)`);
  } catch (error) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).split('\n')[0]}`);
  }
}

const browser = await chromium.launch();
console.log(`Smoke test against ${BASE}`);

await check('a wrong password is refused with a message', async () => {
  const page = await session(browser, null);
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', 'sneha@iima.ac.in');
  await page.fill('input[name=password]', 'not-the-password');
  await page.click('button[type=submit]');
  await page.getByRole('alert').filter({ hasText: /did not work/i }).waitFor({ timeout: 15_000 });
  if (page.url().includes('/home')) throw new Error('signed in with a wrong password');
});

const sneha = await session(browser, 'sneha@iima.ac.in');

await check('Today composes the day and ends cleanly', async () => {
  await sneha.waitForSelector('text=That’s today.', { timeout: 30_000 });
  const summary = await sneha.locator('[data-aurora] p').innerText();
  if (!summary || summary.startsWith('Loading')) throw new Error(`no day summary: "${summary}"`);
  const today = await sneha.evaluate(async () => (await fetch('/api/today')).json());
  if (today.failed.length) throw new Error(`cards failed: ${today.failed.join(', ')}`);
});

await check('the resume studio loads a prefilled draft and autosaves', async () => {
  await sneha.goto(`${BASE}/resume`);
  await sneha.waitForSelector('text=Contact', { timeout: 30_000 });
  const name = sneha.getByLabel('Full name');
  const original = await name.inputValue();
  if (!original) throw new Error('name was not prefilled');
  await name.fill(`${original} `);
  await sneha.waitForSelector('text=Saved', { timeout: 15_000 });
  await name.fill(original);
  await sneha.waitForSelector('text=Saved', { timeout: 15_000 });
});

for (const [path, text] of [
  ['/hub', 'campus'],
  ['/games', 'Tic-Tac-Toe'],
  ['/timetable', 'Timetable'],
  ['/events', 'Events'],
  ['/briefing', 'briefing'],
]) {
  await check(`${path} renders`, async () => {
    await sneha.goto(`${BASE}${path}`);
    await sneha.waitForSelector(`text=/${text}/i`, { timeout: 30_000 });
  });
}

await check('students cannot reach the admin APIs', async () => {
  const statuses = await sneha.evaluate(async () => Promise.all(['/api/admin/campuses', '/api/admin/people', '/api/institute/campus'].map(async (p) => (await fetch(p)).status)));
  if (statuses.some((s) => s !== 403)) throw new Error(`expected 403s, got ${statuses.join(', ')}`);
});

await check('the platform admin sees the success metrics', async () => {
  const admin = await session(browser, 'admin@iima.ac.in');
  await admin.goto(`${BASE}/admin`);
  await admin.waitForSelector('text=First-years with a mock', { timeout: 30_000 });
});

await check('Today fits a phone without sideways scrolling', async () => {
  const phone = await session(browser, 'sneha@iima.ac.in', { width: 390, height: 844 });
  await phone.waitForSelector('text=That’s today.', { timeout: 30_000 });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (overflow > 1) throw new Error(`${overflow}px of horizontal overflow`);
});

await browser.close();

if (problems.length) {
  console.log('\nPage errors and server errors:');
  for (const p of problems) console.log(`  • ${p}`);
}
if (failures.length || problems.length) {
  console.log(`\n${failures.length} check(s) failed, ${problems.length} error(s) seen.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
