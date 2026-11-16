import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, daysBetween, endOfDay, startOfDay, startOfWeek, weekdayOf, zonedTime } from '@/lib/time';

// 18:45 UTC is 00:15 the next day in India — the boundary a UTC host got wrong.
const LATE_EVENING_UTC = new Date('2026-03-10T18:45:00Z');

test('the campus day rolls over at local midnight, not UTC midnight', () => {
  assert.equal(dayKey(LATE_EVENING_UTC), '2026-03-11');
  assert.equal(dayKey(new Date('2026-03-10T18:15:00Z')), '2026-03-10');
});

test('end of day is 23:59:59.999 campus time', () => {
  const end = endOfDay(new Date('2026-03-10T06:00:00Z'));
  assert.equal(end.toISOString(), '2026-03-10T18:29:59.999Z');
});

test('start of day and day offsets', () => {
  assert.equal(startOfDay(LATE_EVENING_UTC).toISOString(), '2026-03-10T18:30:00.000Z');
  assert.equal(startOfDay(LATE_EVENING_UTC, 1).toISOString(), '2026-03-11T18:30:00.000Z');
});

test('weeks start on Monday in the campus zone', () => {
  // Sunday 22:00 IST is still Sunday; the week began the previous Monday.
  const sundayNight = zonedTime({ year: 2026, month: 3, day: 15, hour: 22 });
  assert.equal(weekdayOf(sundayNight), 0);
  assert.equal(startOfWeek(sundayNight).toISOString(), zonedTime({ year: 2026, month: 3, day: 9 }).toISOString());
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1);
  assert.equal(daysBetween('2026-03-01', '2026-03-01'), 0);
  assert.equal(daysBetween('2026-12-31', '2027-01-02'), 2);
});

test('zonedTime normalises overflowing fields', () => {
  assert.equal(
    zonedTime({ year: 2026, month: 1, day: 32, hour: 9 }).toISOString(),
    zonedTime({ year: 2026, month: 2, day: 1, hour: 9 }).toISOString()
  );
});
