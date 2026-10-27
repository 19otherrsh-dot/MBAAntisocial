import { describe, expect, it } from 'vitest';
import { addDays, localDayBounds, startOfLocalDay, weekdayOfKey } from '@/lib/time';

describe('local days', () => {
  it('finds the IST day for an instant late in the UTC evening', () => {
    // 20:00 UTC on 27 Oct is 01:30 IST on 28 Oct.
    const { dayKey, dayStart, dayEnd } = localDayBounds(new Date('2026-10-27T20:00:00Z'), 'Asia/Kolkata');
    expect(dayKey).toBe('2026-10-28');
    expect(dayStart.toISOString()).toBe('2026-10-27T18:30:00.000Z');
    expect(dayEnd.toISOString()).toBe('2026-10-28T18:29:59.999Z');
  });

  it('handles zones behind UTC', () => {
    const { dayKey, dayStart } = localDayBounds(new Date('2026-10-28T03:00:00Z'), 'America/New_York');
    expect(dayKey).toBe('2026-10-27');
    expect(dayStart.toISOString()).toBe('2026-10-27T04:00:00.000Z');
  });

  it('is stable for an instant exactly at local midnight', () => {
    const { dayKey, dayStart } = localDayBounds(new Date('2026-10-27T18:30:00Z'), 'Asia/Kolkata');
    expect(dayKey).toBe('2026-10-28');
    expect(dayStart.toISOString()).toBe('2026-10-27T18:30:00.000Z');
  });

  it('ends a day just before the next one starts, across a DST change', () => {
    // New York falls back on 1 Nov 2026: that day is 25 hours long.
    const { dayStart, dayEnd } = localDayBounds(new Date('2026-11-01T12:00:00Z'), 'America/New_York');
    expect(dayStart.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(dayEnd.toISOString()).toBe('2026-11-02T04:59:59.999Z');
  });

  it('does calendar arithmetic on day keys', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOfKey('2026-10-28')).toBe(3);
    expect(startOfLocalDay('2026-10-28', 'Asia/Kolkata').toISOString()).toBe('2026-10-27T18:30:00.000Z');
  });
});
