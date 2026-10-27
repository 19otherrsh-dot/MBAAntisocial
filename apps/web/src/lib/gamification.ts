import type { Types, QueryFilter } from 'mongoose';
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

/** UTC calendar day key, `YYYY-MM-DD`. */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
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

  if (last === today) {
    return {
      streak: user.streak,
      longestStreak: user.longestStreak,
      isNewDay: false,
      graceUsed: false,
    };
  }

  const gap = last ? daysBetween(last, today) : Infinity;

  let streak: number;
  let graceUsed = false;

  if (gap === 1) {
    streak = user.streak + 1;
  } else if (gap <= 1 + STREAK_GRACE_DAYS) {
    // Within the grace window: the streak survives but does not advance.
    streak = user.streak;
    graceUsed = true;
  } else {
    streak = 1;
  }

  const longestStreak = Math.max(user.longestStreak, streak);

  await User.updateOne(
    { _id: userId },
    { $set: { streak, longestStreak, lastCheckInAt: new Date() } }
  );

  await award(userId, 'daily_check_in');

  const milestone = STREAK_MILESTONES.find((m) => m === streak);
  if (milestone) {
    await award(userId, 'streak_milestone', { entityType: 'streak', entity: undefined });
    if (milestone >= 30) await grantBadge(userId, 'streak_30');
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
