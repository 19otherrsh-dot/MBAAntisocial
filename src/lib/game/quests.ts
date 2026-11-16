import type { PointAction } from '../constants';

/**
 * Daily quests: three small, concrete things to do today, picked from a pool.
 *
 * Every quest is counted from the points ledger — the record of things that
 * actually happened — so a quest cannot be completed by anything the client
 * claims, only by doing the thing.
 */
export interface QuestDefinition {
  key: string;
  title: string;
  /** Ledger actions that count towards it. */
  actions: PointAction[];
  target: number;
  xp: number;
  href: string;
  /** Who the quest makes sense for. */
  audience: 'everyone' | 'mentors' | 'students';
}

export const QUEST_POOL: readonly QuestDefinition[] = [
  { key: 'tasks', title: 'Tick off 2 tasks', actions: ['task_completed'], target: 2, xp: 15, href: '/tasks', audience: 'everyone' },
  { key: 'on_time', title: 'Beat a deadline', actions: ['task_completed_on_time'], target: 1, xp: 10, href: '/tasks', audience: 'everyone' },
  { key: 'pipeline', title: 'Update your pipeline', actions: ['round_logged'], target: 1, xp: 10, href: '/pipeline', audience: 'students' },
  { key: 'intel', title: 'Log an interview question', actions: ['question_contributed'], target: 1, xp: 25, href: '/intel', audience: 'everyone' },
  { key: 'ai_answers', title: 'Answer 3 AI interview questions', actions: ['ai_answer'], target: 3, xp: 15, href: '/ai-interview', audience: 'students' },
  { key: 'ai_debrief', title: 'Finish an AI mock with a scorecard', actions: ['ai_debrief'], target: 1, xp: 20, href: '/ai-interview', audience: 'students' },
  { key: 'react', title: 'React to 3 feed posts', actions: ['reaction_given'], target: 3, xp: 10, href: '/feed', audience: 'everyone' },
  { key: 'reply', title: 'Reply to someone on the feed', actions: ['comment_posted'], target: 1, xp: 10, href: '/feed', audience: 'everyone' },
  { key: 'upvote', title: 'Upvote 2 helpful notes or questions', actions: ['upvote_given'], target: 2, xp: 10, href: '/intel', audience: 'everyone' },
  { key: 'comp', title: 'Save a case competition', actions: ['comp_saved'], target: 1, xp: 10, href: '/comps', audience: 'students' },
  { key: 'feedback', title: 'Leave feedback on a session', actions: ['feedback_given'], target: 1, xp: 20, href: '/sessions?view=hosting', audience: 'mentors' },
  { key: 'share', title: 'Share a resource with your batch', actions: ['resource_shared'], target: 1, xp: 20, href: '/resources', audience: 'everyone' },
];

export const QUESTS_PER_DAY = 3;
/** Bonus for finishing all of the day's quests. */
export const CHEST_XP = 30;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Today's quests for one person. Deterministic in (user, day), so every device
 * shows the same three, and different people get different ones.
 */
export function questsFor(userId: string, day: string, isMentor: boolean): QuestDefinition[] {
  const eligible = QUEST_POOL.filter(
    (quest) =>
      quest.audience === 'everyone' ||
      (quest.audience === 'mentors' && isMentor) ||
      (quest.audience === 'students' && !isMentor)
  );
  return [...eligible]
    .sort((a, b) => hash(`${userId}:${day}:${a.key}`) - hash(`${userId}:${day}:${b.key}`))
    .slice(0, QUESTS_PER_DAY);
}
