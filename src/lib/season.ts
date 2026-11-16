import { zonedParts, zonedTime } from './time';

/**
 * Placement seasons and the campus's shared goal for each.
 *
 * Pure functions, so the tiering is testable without a database.
 */

/** Month a season starts in: July, when the new first-years arrive. */
const SEASON_START_MONTH = 7;

/** Midnight on 1 July of the season `date` falls in, campus time. */
export function seasonStart(date: Date = new Date()): Date {
  const now = zonedParts(date);
  const year = now.month >= SEASON_START_MONTH ? now.year : now.year - 1;
  return zonedTime({ year, month: SEASON_START_MONTH, day: 1 });
}

/** "2026–27", for labels. */
export function seasonLabel(date: Date = new Date()): string {
  const start = zonedParts(seasonStart(date));
  return `${start.year}–${String(start.year + 1).slice(-2)}`;
}

/**
 * Milestones for the campus's interview-question bank. A ladder rather than
 * one big number, so a small campus has a goal it can actually reach this
 * month, and a large one is never "done".
 */
export const QUESTION_GOALS = [25, 50, 100, 200, 400, 800, 1600] as const;

export interface GoalProgress {
  /** The milestone being worked towards. */
  target: number;
  /** The milestone already passed, or 0. */
  previous: number;
  /** Progress from `previous` to `target`, 0–1. */
  fraction: number;
  /** True once the top of the ladder is passed. */
  complete: boolean;
}

export function goalProgress(count: number, goals: readonly number[] = QUESTION_GOALS): GoalProgress {
  const target = goals.find((goal) => goal > count);
  if (target === undefined) {
    const top = goals[goals.length - 1];
    return { target: top, previous: top, fraction: 1, complete: true };
  }
  const index = goals.indexOf(target);
  const previous = index > 0 ? goals[index - 1] : 0;
  return { target, previous, fraction: (count - previous) / (target - previous), complete: false };
}
