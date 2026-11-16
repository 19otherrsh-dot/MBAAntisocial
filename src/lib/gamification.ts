import { Types, type QueryFilter } from 'mongoose';
import User, { type IUser } from '@/models/User';
import LedgerEntry from '@/models/LedgerEntry';
import { notify } from './notifications';
import {
  POINT_RULES,
  STREAK_MILESTONES,
  STREAK_GRACE_DAYS,
  BADGE_BY_ID,
  type PointAction,
} from './constants';

import { dayKey, daysBetween } from './time';

export { dayKey };

export type StreakStep = 'same_day' | 'advance' | 'grace' | 'reset';

/**
 * What a check-in does to a streak, given the day of the previous one.
 *
 * Pure, so the rule is testable without a database: consecutive days advance,
 * a gap inside the grace window holds the streak where it was, anything longer
 * starts again from one.
 */
export function nextStreak(
  current: number,
  lastDay: string | null,
  today: string
): { streak: number; step: StreakStep } {
  if (lastDay === today) return { streak: current, step: 'same_day' };
  const gap = lastDay ? daysBetween(lastDay, today) : Infinity;
  if (gap === 1) return { streak: current + 1, step: 'advance' };
  if (gap > 1 && gap <= 1 + STREAK_GRACE_DAYS) return { streak: current, step: 'grace' };
  return { streak: 1, step: 'reset' };
}

/**
 * A stable ledger entity for "reached an N-day streak".
 *
 * The ledger's unique (user, action, entity) index is what makes an award pay
 * once. A milestone has no document of its own to key on, so it gets a
 * deterministic id derived from N — which makes each milestone payable exactly
 * once per person, ever, rather than every time a streak happens to pass it.
 */
export function milestoneEntity(milestone: number): Types.ObjectId {
  return new Types.ObjectId(milestone.toString(16).padStart(24, '0'));
}

export interface AwardOptions {
  entityType?: string;
  entity?: Types.ObjectId | string;
}

export interface AwardResult {
  awarded: boolean;
  amount: number;
  track: 'points' | 'karma';
  /** Why nothing was awarded, when `awarded` is false. */
  reason?: 'daily_cap' | 'duplicate';
}

/**
 * Credits a user under `action`, writing the ledger entry and bumping the
 * matching total.
 *
 * Two abuse guards, both enforced here rather than at call sites:
 *
 * 1. Daily caps — a user cannot farm an action by repeating it all afternoon.
 * 2. Per-entity uniqueness — the unique index on (user, action, entity) makes a
 *    duplicate award a no-op, so the old book/cancel/re-book loop that paid out
 *    every time is closed. A duplicate-key error is the expected path, not a bug.
 *
 * Never throws for a refused award; callers should not have to care.
 */
export async function award(
  userId: string,
  action: PointAction,
  options: AwardOptions = {}
): Promise<AwardResult> {
  const rule = POINT_RULES[action];
  const today = dayKey();

  if (rule.dailyCap !== null) {
    const usedToday = await LedgerEntry.countDocuments({ user: userId, action, day: today });
    if (usedToday >= rule.dailyCap) {
      return { awarded: false, amount: 0, track: rule.track, reason: 'daily_cap' };
    }
  }

  try {
    await LedgerEntry.create({
      user: userId,
      action,
      track: rule.track,
      amount: rule.points,
      entityType: options.entityType,
      entity: options.entity,
      day: today,
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      return { awarded: false, amount: 0, track: rule.track, reason: 'duplicate' };
    }
    throw error;
  }

  await User.updateOne({ _id: userId }, { $inc: { [rule.track]: rule.points } });

  return { awarded: true, amount: rule.points, track: rule.track };
}

/** Reverses a previously granted award, e.g. when an upvote is withdrawn. */
export async function revoke(
  userId: string,
  action: PointAction,
  entity: Types.ObjectId | string
): Promise<void> {
  const entry = await LedgerEntry.findOneAndDelete({ user: userId, action, entity });
  if (!entry) return;
  // `$max` floors the result at zero so a total can never go negative.
  const current = await User.findById(userId).select(entry.track).lean();
  if (!current) return;
  const next = Math.max(0, (current[entry.track] ?? 0) - entry.amount);
  await User.updateOne({ _id: userId }, { $set: { [entry.track]: next } });
}

export interface StreakResult {
  streak: number;
  longestStreak: number;
  /** False when the user already checked in today. */
  isNewDay: boolean;
  /** Set when this check-in crossed a milestone. */
  milestone?: number;
  /** True when a missed day was forgiven rather than resetting the streak. */
  graceUsed: boolean;
}

/**
 * Records a daily check-in and advances the streak.
 *
 * A single missed day is forgiven (`STREAK_GRACE_DAYS`). §16 rules out
 * guilt-based streak mechanics, and a streak that shatters the first time
 * someone has a bad week is exactly that — it punishes the users under the most
 * pressure. Grace keeps the habit signal without the cliff.
 */
export async function recordCheckIn(userId: string): Promise<StreakResult> {
  const user = await User.findById(userId).select(
    'streak longestStreak lastCheckInAt badges name'
  );
  if (!user) throw new Error(`User ${userId} not found`);

  const today = dayKey();
  const last = user.lastCheckInAt ? dayKey(user.lastCheckInAt) : null;
  const { streak, step } = nextStreak(user.streak, last, today);

  if (step === 'same_day') {
    return {
      streak: user.streak,
      longestStreak: user.longestStreak,
      isNewDay: false,
      graceUsed: false,
    };
  }

  const graceUsed = step === 'grace';
  const longestStreak = Math.max(user.longestStreak, streak);

  await User.updateOne(
    { _id: userId },
    { $set: { streak, longestStreak, lastCheckInAt: new Date() } }
  );

  await award(userId, 'daily_check_in');

  /*
   * A milestone is reached by *advancing* onto it. A grace day holds the streak
   * where it was, so without this guard, checking in every other day while
   * sitting on a milestone paid the bonus out again each time — worth more than
   * actually showing up daily.
   */
  let milestone: number | undefined;
  if (step === 'advance' && (STREAK_MILESTONES as readonly number[]).includes(streak)) {
    const result = await award(userId, 'streak_milestone', {
      entityType: 'streak',
      entity: milestoneEntity(streak),
    });
    // Announced only the first time; climbing back to the same number after a
    // reset is not news.
    if (result.awarded) milestone = streak;
    if (streak >= 30) await grantBadge(userId, 'streak_30');
  }

  return { streak, longestStreak, isNewDay: true, milestone, graceUsed };
}

/** Adds a badge if the user does not already hold it, and notifies them once. */
export async function grantBadge(userId: string, badgeId: string): Promise<boolean> {
  const badge = BADGE_BY_ID.get(badgeId);
  if (!badge) return false;

  const result = await User.updateOne(
    { _id: userId, badges: { $ne: badgeId } },
    { $addToSet: { badges: badgeId } }
  );

  if (result.modifiedCount === 0) return false;

  await notify({
    user: userId,
    kind: 'badge_earned',
    title: `Badge earned — ${badge.label}`,
    body: badge.description,
    href: '/profile',
  });

  return true;
}

/**
 * Re-evaluates contribution badges after a hosting or sharing milestone.
 * Cheap enough to call on the relevant write paths; nothing here fans out.
 */
export async function evaluateContributionBadges(userId: string): Promise<void> {
  const user = await User.findById(userId).select('sessionsHosted badges').lean();
  if (!user) return;

  if (user.sessionsHosted >= 1) await grantBadge(userId, 'first_mock');
  if (user.sessionsHosted >= 5) await grantBadge(userId, 'mocks_hosted_5');
  if (user.sessionsHosted >= 25) await grantBadge(userId, 'mocks_hosted_25');
}

export interface LeaderboardRow {
  _id: string;
  name: string;
  image: string;
  year: 1 | 2;
  points: number;
  karma: number;
  streak: number;
  badges: string[];
  campus?: string;
}

/**
 * Campus leaderboard, restricted to users who opted in (§6.3).
 *
 * Opt-in is enforced in the query rather than filtered in the UI, so someone
 * who never opted in is not merely hidden — they are not in the result at all.
 */
export async function getLeaderboard(
  campus?: string | null,
  track: 'points' | 'karma' = 'karma',
  limit = 25
): Promise<LeaderboardRow[]> {
  const filter: QueryFilter<IUser> = {
    leaderboardOptIn: true,
    suspendedAt: { $exists: false },
  };
  // Omitting the campus widens this to the global board.
  if (campus) filter.campus = campus;

  const rows = await User.find(filter)
    .sort({ [track]: -1, name: 1 })
    .limit(limit)
    .select('name image year points karma streak badges campus')
    .lean();

  return rows.map((row) => ({
    _id: row._id.toString(),
    name: row.name,
    image: row.image ?? '',
    year: row.year,
    points: row.points,
    karma: row.karma,
    streak: row.streak,
    badges: row.badges ?? [],
    campus: row.campus,
  }));
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  );
}
