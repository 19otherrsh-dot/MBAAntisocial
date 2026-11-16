import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStreak, milestoneEntity } from '@/lib/gamification';
import { goalProgress, seasonLabel, seasonStart } from '@/lib/season';
import { formatInr, toBand, formatBand } from '@/lib/money';
import { parseChannel, userChannel, roomChannel } from '@/lib/realtime';
import { targetKeyOf } from '@/models/Whisper';
import { companyKeyOf } from '@/models/Application';
import { campusForEmail, isCampusBound } from '@/lib/env';
import { zonedTime } from '@/lib/time';

test('streak: consecutive days advance, one missed day holds, two reset', () => {
  assert.deepEqual(nextStreak(6, '2026-03-09', '2026-03-10'), { streak: 7, step: 'advance' });
  assert.deepEqual(nextStreak(6, '2026-03-08', '2026-03-10'), { streak: 6, step: 'grace' });
  assert.deepEqual(nextStreak(6, '2026-03-07', '2026-03-10'), { streak: 1, step: 'reset' });
  assert.deepEqual(nextStreak(6, '2026-03-10', '2026-03-10'), { streak: 6, step: 'same_day' });
  assert.deepEqual(nextStreak(0, null, '2026-03-10'), { streak: 1, step: 'reset' });
});

test('streak: a grace day never counts as reaching a milestone', () => {
  // The farming bug: sitting on 7 and checking in every other day re-paid it.
  const { step } = nextStreak(7, '2026-03-08', '2026-03-10');
  assert.equal(step, 'grace');
});

test('milestone ledger entities are stable and distinct', () => {
  assert.equal(String(milestoneEntity(7)), String(milestoneEntity(7)));
  assert.notEqual(String(milestoneEntity(7)), String(milestoneEntity(14)));
});

test('season goal ladder', () => {
  assert.deepEqual(goalProgress(0), { target: 25, previous: 0, fraction: 0, complete: false });
  assert.deepEqual(goalProgress(30), { target: 50, previous: 25, fraction: 0.2, complete: false });
  assert.equal(goalProgress(25).target, 50);
  assert.equal(goalProgress(5000).complete, true);
});

test('seasons start on 1 July, campus time', () => {
  assert.equal(seasonLabel(zonedTime({ year: 2026, month: 11, day: 16 })), '2026–27');
  assert.equal(seasonLabel(zonedTime({ year: 2027, month: 3, day: 1 })), '2026–27');
  assert.equal(seasonStart(zonedTime({ year: 2026, month: 7, day: 1, hour: 0, minute: 5 })).toISOString(),
    zonedTime({ year: 2026, month: 7, day: 1 }).toISOString());
});

test('rupee formatting and bands', () => {
  assert.equal(formatInr(3_400_000), '₹34L');
  assert.equal(formatInr(12_500_000), '₹1.25Cr');
  assert.equal(formatInr(85_000), '₹85k');
  assert.deepEqual(toBand(3_456_789), { low: 3_400_000, high: 3_500_000 });
  assert.equal(formatBand(toBand(3_456_789)), '₹34L–35L');
});

test('realtime channels: only well-formed private channels parse', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  assert.deepEqual(parseChannel(userChannel(id)), { kind: 'user', id });
  assert.deepEqual(parseChannel(roomChannel(id)), { kind: 'room', id });
  // The old public channel names, and anything else, are refused.
  assert.equal(parseChannel(`user-${id}`), null);
  assert.equal(parseChannel(`private-user-${id}-extra`), null);
  assert.equal(parseChannel('private-admin-all'), null);
});

test('whisper targets: respellings of one person share a key', () => {
  const key = targetKeyOf('Prof. Sharma');
  assert.equal(targetKeyOf('prof sharma'), key);
  assert.equal(targetKeyOf('Dr Sharma'), key);
  assert.equal(targetKeyOf('Professor   SHARMA'), key);
  assert.notEqual(targetKeyOf('Prof. Mehta'), key);
});

test('company names normalise', () => {
  assert.equal(companyKeyOf('McKinsey & Co.'), companyKeyOf('mckinsey and company'));
});

test('email domains bind a campus', () => {
  assert.equal(campusForEmail('a@iima.ac.in'), 'IIM Ahmedabad');
  assert.equal(campusForEmail('a@students.iimb.ac.in'), 'IIM Bangalore');
  assert.equal(campusForEmail('a@gmail.com'), null);
  assert.equal(isCampusBound('IIM Ahmedabad'), true);
  assert.equal(isCampusBound('XLRI Jamshedpur'), false);
});
