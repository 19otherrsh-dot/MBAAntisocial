/**
 * Exercises every Claude-backed feature once against a running, seeded
 * instance, so prompts can be checked the day a key is added:
 *
 *   ANTHROPIC_API_KEY=… npm run dev     # or a production build with the key
 *   npm run check-ai -w @mba/web         # BASE defaults to http://localhost:3000
 *
 * Each surface goes through its real API route (same prompts, schemas and
 * limits as the app). It prints what came back, how long it took, and fails if
 * any surface errors or returns something the UI could not use. Costs a few
 * cents per run. The interviewer and GD calls are the only streamed ones.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const results = [];

const login = await fetch(`${BASE}/api/mobile/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.EMAIL ?? 'sneha@iima.ac.in', password: process.env.PASSWORD ?? 'seedpassword123' }),
}).then((r) => r.json());
if (!login.token) throw new Error(`Could not sign in: ${JSON.stringify(login)}`);
const auth = { authorization: `Bearer ${login.token}` };

async function call(path, body, { stream = false, form } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: form ? auth : { ...auth, 'content-type': 'application/json' },
    body: form ?? JSON.stringify(body),
  });
  if (response.status === 503) {
    console.log('AI is not configured on that instance: set ANTHROPIC_API_KEY and restart it.');
    process.exit(2);
  }
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return stream ? response.text() : response.json();
}

async function check(name, fn) {
  const started = Date.now();
  try {
    const sample = await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)\n      ${String(sample).replace(/\s+/g, ' ').slice(0, 220)}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started });
    console.log(`  ✗ ${name}\n      ${String(error?.message ?? error).slice(0, 300)}`);
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log(`AI check against ${BASE}`);

let question = '';
await check('AI interviewer opens and follows up (stream)', async () => {
  question = await call('/api/ai/interview', { messages: [], track: 'consulting', style: 'personal' }, { stream: true });
  expect(question.trim().length > 20, 'first question was empty');
  const followUp = await call('/api/ai/interview', { messages: [{ role: 'assistant', content: question }, { role: 'user', content: 'I spent three years in supply-chain analytics at an FMCG firm and want to move into strategy consulting because I enjoy structuring ambiguous problems.' }], track: 'consulting', style: 'personal' }, { stream: true });
  expect(followUp.trim().length > 20, 'follow-up was empty');
  return `Q: ${question.slice(0, 100)} … Follow-up: ${followUp.slice(0, 100)}`;
});

await check('GD simulator voices the group (stream)', async () => {
  const text = await call('/api/ai/gd', { messages: [], topic: 'Should India adopt a four-day work week?', participants: 3 }, { stream: true });
  expect(text.trim().length > 40, 'no opening statements');
  return text;
});

await check('Scorecard for a finished interview (structured)', async () => {
  const { scorecard } = await call('/api/ai/scorecard', {
    kind: 'interview',
    transcript: [
      { role: 'assistant', content: question || 'Walk me through your resume.' },
      { role: 'user', content: 'I led a demand-forecasting project that cut stockouts by 18% across 40 distributors, and presented it to the regional VP.' },
      { role: 'assistant', content: 'What would you do differently?' },
      { role: 'user', content: 'Involve the sales team earlier; we lost two weeks reconciling their numbers with ours.' },
    ],
  });
  expect(scorecard && typeof scorecard === 'object', 'no scorecard');
  return JSON.stringify(scorecard);
});

await check('Resume bullet rewrites (structured)', async () => {
  const { options } = await call('/api/ai/bullet', { bullet: 'Worked on a forecasting project that helped reduce stockouts', role: 'Analyst, FMCG', target: 'Consulting' });
  expect(Array.isArray(options) && options.length >= 2, 'expected at least two rewrites');
  return options.join(' | ');
});

await check('Resume roast from text (stream)', async () => {
  const text = await call('/api/ai/roast', {
    text: 'Sneha Kulkarni — PGP 2025-27, IIM Ahmedabad. Analyst, Hindustan Consumer Goods (2021-24): built demand forecasts for 40 distributors; cut stockouts 18%; presented to the regional VP. Captain, college debating team. Skills: Excel, SQL, Python.',
    target: 'Consulting',
  }, { stream: true });
  expect(text.trim().length > 80, 'roast was too short');
  return text;
});

await check('Jargon buster (structured)', async () => {
  const { explanation, cached } = await call('/api/ai/jargon', { term: 'cash conversion cycle' });
  expect(explanation?.plainEnglish, 'no plain-English explanation');
  return `${cached ? '(glossary) ' : ''}${explanation.plainEnglish}`;
});

await check('Timetable import from a photo (vision, structured)', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 420 } });
  await page.setContent(`<style>body{font:15px sans-serif;padding:16px}td,th{border:1px solid #333;padding:8px}table{border-collapse:collapse}</style>
    <h3>PGP Term II — Section B</h3><table><tr><th>Time</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th></tr>
    <tr><td>09:00–10:30</td><td>FIN-201 Corporate Finance (C-12)</td><td></td><td>FIN-201 Corporate Finance (C-12)</td><td></td></tr>
    <tr><td>11:00–12:30</td><td></td><td>MKT-302 Marketing Strategy (C-14)</td><td></td><td>MKT-302 Marketing Strategy (C-14)</td></tr>
    <tr><td>14:00–15:30</td><td>OB-304 Organisational Behaviour (Seminar hall)</td><td></td><td></td><td>OB-304 Organisational Behaviour (Seminar hall)</td></tr></table>`);
  const png = await page.screenshot();
  await browser.close();
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'timetable.png');
  const { courses } = await call('/api/academics/import', null, { form });
  const slots = courses.reduce((n, c) => n + c.slots.length, 0);
  expect(courses.length === 3, `expected 3 courses, got ${courses.length}`);
  expect(slots === 6, `expected 6 weekly classes, got ${slots}`);
  return courses.map((c) => `${c.code || c.name}: ${c.slots.map((s) => `${s.day} ${s.start}-${s.end}`).join(', ')}`).join(' · ');
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} AI surfaces worked.`);
console.log('Not covered here: the daily briefing summary and quiz, which run from /api/cron/news (needs CRON_SECRET).');
if (failed.length) process.exit(1);
