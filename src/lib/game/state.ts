import { Types } from 'mongoose';
import User from '@/models/User';
import LedgerEntry from '@/models/LedgerEntry';
import Application from '@/models/Application';
import { MENTOR_ROLES, type PointAction } from '../constants';
import { dayKey, startOfWeek } from '../time';
import { stableId } from './ids';
import { levelProgress, DEFAULT_DAILY_GOAL, type LevelProgress } from './levels';
import { questsFor, CHEST_XP, type QuestDefinition } from './quests';
import { evaluateAchievements, type AchievementState } from './achievements';
import { pathFor, type PathCounts } from './path';

export interface QuestState {
  key: string;
  title: string;
  progress: number;
  target: number;
  xp: number;
  href: string;
  claimed: boolean;
}

export interface PathStepState {
  key: string;
  title: string;
  hint: string;
  href: string;
  xp: number;
  milestone: boolean;
  status: 'done' | 'current' | 'locked';
  claimed: boolean;
}

export interface GameState {
  xp: number;
  level: LevelProgress;
  today: { xp: number; goal: number; goalMet: boolean };
  week: { xp: number };
  streak: { days: number; longest: number; shields: number };
  quests: QuestState[];
  chest: { ready: boolean; claimed: boolean; xp: number };
  achievements: AchievementState[];
  path: PathStepState[];
  /** Things reached that have not been celebrated on screen yet. */
  unseen: { level: number | null; achievements: Array<{ key: string; tier: number }> };
}

/** Ledger entity for one quest on one day, so a claim pays exactly once. */
export const questEntity = (userId: string, day: string, key: string) => stableId(`quest:${userId}:${day}:${key}`);
export const chestEntity = (userId: string, day: string) => stableId(`chest:${userId}:${day}`);
export const pathEntity = (userId: string, key: string) => stableId(`path:${userId}:${key}`);

/**
 * Everything the game layer shows, computed from the ledger and the account.
 *
 * Nothing here is a separately stored truth: quest progress is today's ledger
 * rows, achievements are lifetime counts, the path is derived from both. Only
 * which celebrations have been *seen* is stored.
 */
export async function loadGameState(userId: string): Promise<GameState> {
  const me = new Types.ObjectId(userId);
  const day = dayKey();

  const user = await User.findById(userId)
    .select('role points karma streak longestStreak streakShields dailyGoal celebrated bio sessionsHosted sessionsAttended mentorProfile.acceptingBookings')
    .lean();
  if (!user) throw new Error(`User ${userId} not found`);

  const isMentor = MENTOR_ROLES.includes(user.role);
  const quests = questsFor(userId, day, isMentor);

  const [todayRows, weekRows, lifetime, applications] = await Promise.all([
    LedgerEntry.aggregate<{ _id: string; count: number; xp: number }>([
      { $match: { user: me, day } },
      { $group: { _id: '$action', count: { $sum: 1 }, xp: { $sum: '$amount' } } },
    ]),
    LedgerEntry.aggregate<{ xp: number }>([
      { $match: { user: me, createdAt: { $gte: startOfWeek() } } },
      { $group: { _id: null, xp: { $sum: '$amount' } } },
    ]),
    LedgerEntry.aggregate<{ _id: string; count: number }>([
      { $match: { user: me } },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]),
    Application.countDocuments({ user: me }),
  ]);

  const todayCount = (actions: readonly string[]) =>
    todayRows.filter((row) => actions.includes(row._id)).reduce((sum, row) => sum + row.count, 0);
  const lifetimeCount = (action: PointAction) => lifetime.find((row) => row._id === action)?.count ?? 0;

  // Which of today's rewards are already claimed: one indexed lookup on the
  // exact entities that could be, rather than every reward ever paid.
  const candidates = [
    ...quests.map((quest) => questEntity(userId, day, quest.key)),
    chestEntity(userId, day),
    ...pathFor(isMentor).map((step) => pathEntity(userId, step.key)),
  ];
  const claimedEntities = new Set(
    (
      await LedgerEntry.find({
        user: me,
        action: { $in: ['quest_reward', 'chest_reward', 'path_reward'] },
        entity: { $in: candidates },
      })
        .select('entity')
        .lean()
    ).map((row) => String(row.entity))
  );

  const questStates: QuestState[] = quests.map((quest: QuestDefinition) => ({
    key: quest.key,
    title: quest.title,
    progress: Math.min(quest.target, todayCount(quest.actions)),
    target: quest.target,
    xp: quest.xp,
    href: quest.href,
    claimed: claimedEntities.has(String(questEntity(userId, day, quest.key))),
  }));

  const xp = (user.points ?? 0) + (user.karma ?? 0);
  const level = levelProgress(xp);
  const todayXp = todayRows.reduce((sum, row) => sum + row.xp, 0);
  const goal = user.dailyGoal ?? DEFAULT_DAILY_GOAL;

  const counts: PathCounts = {
    longestStreak: user.longestStreak ?? 0,
    questionsLogged: lifetimeCount('question_contributed'),
    // The session counters include sessions recorded before the ledger existed.
    sessionsHosted: Math.max(user.sessionsHosted ?? 0, lifetimeCount('mock_hosted')),
    sessionsAttended: Math.max(user.sessionsAttended ?? 0, lifetimeCount('mock_attended')),
    tasksCompleted: lifetimeCount('task_completed'),
    resourcesShared: lifetimeCount('resource_shared'),
    aiDebriefs: lifetimeCount('ai_debrief'),
    answersUseful: lifetimeCount('answer_marked_useful'),
    hasBio: Boolean(user.bio?.trim()),
    applications,
    level: level.level,
    hostingOn: Boolean(user.mentorProfile?.acceptingBookings),
  };

  const achievements = evaluateAchievements(counts);

  let currentFound = false;
  const path: PathStepState[] = pathFor(isMentor).map((step) => {
    const done = step.done(counts);
    let status: PathStepState['status'] = 'done';
    if (!done) {
      status = currentFound ? 'locked' : 'current';
      currentFound = true;
    }
    return {
      key: step.key,
      title: step.title,
      hint: step.hint,
      href: step.href,
      xp: step.xp,
      milestone: Boolean(step.milestone),
      status,
      claimed: claimedEntities.has(String(pathEntity(userId, step.key))),
    };
  });

  // First load ever: everything already reached counts as seen.
  if (!user.celebrated?.since) {
    await User.updateOne(
      { _id: me, 'celebrated.since': { $exists: false } },
      {
        $set: {
          'celebrated.since': new Date(),
          'celebrated.level': level.level,
          ...Object.fromEntries(achievements.map((entry) => [`celebrated.achievements.${entry.key}`, entry.tier])),
        },
      }
    );
    user.celebrated = {
      level: level.level,
      achievements: new Map(achievements.map((entry) => [entry.key, entry.tier])),
      since: new Date(),
    };
  }

  const celebratedAchievements =
    user.celebrated?.achievements instanceof Map
      ? Object.fromEntries(user.celebrated.achievements)
      : ((user.celebrated?.achievements as unknown as Record<string, number>) ?? {});

  const allQuestsDone = questStates.every((quest) => quest.progress >= quest.target);

  return {
    xp,
    level,
    today: { xp: todayXp, goal, goalMet: todayXp >= goal },
    week: { xp: weekRows[0]?.xp ?? 0 },
    streak: { days: user.streak ?? 0, longest: user.longestStreak ?? 0, shields: user.streakShields ?? 0 },
    quests: questStates,
    chest: {
      ready: allQuestsDone,
      claimed: claimedEntities.has(String(chestEntity(userId, day))),
      xp: CHEST_XP,
    },
    achievements,
    path,
    unseen: {
      level: level.level > (user.celebrated?.level ?? 1) ? level.level : null,
      achievements: achievements
        .filter((entry) => entry.tier > (celebratedAchievements[entry.key] ?? 0))
        .map((entry) => ({ key: entry.key, tier: entry.tier })),
    },
  };
}
