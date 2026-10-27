import { describe, expect, it } from 'vitest';
import { attendanceOutlook, gpa, neededOnRemaining, overlaps, parseClock, summariseComponents } from '../src/academics';
import { emi, loanSchedule, monthsToRepay } from '../src/money';

describe('attendance outlook', () => {
  it('counts skips that keep you at the bar', () => {
    // 30/36 = 83.3%; at 75% you can miss 4 more (30/40 = 75%).
    const o = attendanceOutlook({ attended: 30, missed: 6 }, 75);
    expect(o.percent).toBe(83.3);
    expect(o.canSkip).toBe(4);
    expect(o.mustAttend).toBe(0);
  });

  it('counts classes needed to recover', () => {
    // 6/10 = 60%; need k with (6+k)/(10+k) >= .75 → k = 6.
    const o = attendanceOutlook({ attended: 6, missed: 4 }, 75);
    expect(o.canSkip).toBe(0);
    expect(o.mustAttend).toBe(6);
  });

  it('knows when the term cannot be saved', () => {
    const o = attendanceOutlook({ attended: 2, missed: 8, remaining: 4 }, 75);
    expect(o.recoverable).toBe(false);
    expect(o.bestCase).toBe(42.9);
  });

  it('starts at 100% with nothing held', () => {
    expect(attendanceOutlook({ attended: 0, missed: 0 }, 75).percent).toBe(100);
  });
});

describe('grades', () => {
  it('weights GPA by credits and skips ungraded courses', () => {
    expect(gpa([{ credits: 3, points: 4 }, { credits: 1.5, points: 3 }, { credits: 3, points: null }])).toBe(3.67);
    expect(gpa([])).toBeNull();
  });

  it('summarises components and the score needed on what is left', () => {
    const components = [
      { name: 'Quiz', weight: 20, score: 16, max: 20 },
      { name: 'Mid-term', weight: 30, score: 21, max: 30 },
      { name: 'Final', weight: 50, max: 100 },
    ];
    expect(summariseComponents(components)).toMatchObject({ earned: 37, gradedWeight: 50, pendingWeight: 50, currentPercent: 74 });
    // Reaching 80 overall needs 43 of the remaining 50 → 86%.
    expect(neededOnRemaining(components, 80)).toBe(86);
  });
});

describe('timetable helpers', () => {
  it('parses clocks and detects overlaps', () => {
    expect(parseClock('09:30')).toBe(570);
    expect(parseClock('25:00')).toBeNull();
    expect(overlaps({ day: 1, start: '09:00', end: '10:30' }, { day: 1, start: '10:00', end: '11:00' })).toBe(true);
    expect(overlaps({ day: 1, start: '09:00', end: '10:00' }, { day: 1, start: '10:00', end: '11:00' })).toBe(false);
  });
});

describe('loans', () => {
  it('computes a standard EMI', () => {
    // ₹20L at 10% over 10 years ≈ ₹26,430.
    expect(Math.round(emi(2_000_000, 10, 120))).toBe(26430);
  });

  it('capitalises moratorium interest unless it is paid', () => {
    const capitalised = loanSchedule({ principal: 2_000_000, annualRate: 10, tenureMonths: 120, moratoriumMonths: 30 });
    const paid = loanSchedule({ principal: 2_000_000, annualRate: 10, tenureMonths: 120, moratoriumMonths: 30, payInterestDuringMoratorium: true });
    expect(capitalised.moratoriumInterest).toBe(500000);
    expect(capitalised.repaymentPrincipal).toBe(2_500_000);
    expect(paid.emi).toBeLessThan(capitalised.emi);
    expect(paid.totalPaid).toBeLessThan(capitalised.totalPaid);
  });

  it('knows when a payment never clears the loan', () => {
    expect(monthsToRepay(1_000_000, 12, 5000)).toBe(Infinity);
    expect(monthsToRepay(100_000, 0, 10_000)).toBe(10);
  });
});
