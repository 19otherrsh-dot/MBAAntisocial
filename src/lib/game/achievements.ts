/**
 * Tiered achievements. Each is one measurable thing with a ladder of
 * thresholds; reaching a rung unlocks the next tier. Computed from counts the
 * product already keeps, never stored as a separate truth that could drift.
 */
export interface AchievementDefinition {
  key: string;
  name: string;
  /** "{n}" is replaced by the next threshold, and "{s}" by a plural "s" when it is not 1. */
  describe: string;
  tiers: readonly number[];
  metric: keyof AchievementCounts;
  icon: 'flame' | 'book' | 'mic' | 'target' | 'check' | 'library' | 'bot' | 'heart';
}

export interface AchievementCounts {
  longestStreak: number;
  questionsLogged: number;
  sessionsHosted: number;
  sessionsAttended: number;
  tasksCompleted: number;
  resourcesShared: number;
  aiDebriefs: number;
  answersUseful: number;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { key: 'wildfire', name: 'Wildfire', describe: 'Reach a {n}-day streak', tiers: [3, 7, 14, 30, 60, 100], metric: 'longestStreak', icon: 'flame' },
  { key: 'field_notes', name: 'Field Notes', describe: 'Log {n} interview question{s}', tiers: [1, 5, 10, 25, 50], metric: 'questionsLogged', icon: 'book' },
  { key: 'open_door', name: 'Open Door', describe: 'Host {n} mock{s}', tiers: [1, 5, 10, 25, 50], metric: 'sessionsHosted', icon: 'mic' },
  { key: 'battle_tested', name: 'Battle Tested', describe: 'Complete {n} mock{s} with a senior', tiers: [1, 3, 5, 10, 20], metric: 'sessionsAttended', icon: 'target' },
  { key: 'closer', name: 'Closer', describe: 'Complete {n} task{s}', tiers: [5, 25, 50, 100, 250], metric: 'tasksCompleted', icon: 'check' },
  { key: 'archivist', name: 'Archivist', describe: 'Share {n} resource{s}', tiers: [1, 5, 10, 25], metric: 'resourcesShared', icon: 'library' },
  { key: 'sparring', name: 'Sparring Partner', describe: 'Finish {n} AI mock{s} with a scorecard', tiers: [1, 5, 15, 30], metric: 'aiDebriefs', icon: 'bot' },
  { key: 'good_samaritan', name: 'Good Samaritan', describe: 'Have {n} feed answer{s} marked useful', tiers: [1, 5, 15, 40], metric: 'answersUseful', icon: 'heart' },
];

export interface AchievementState {
  key: string;
  name: string;
  icon: AchievementDefinition['icon'];
  /** Tiers reached, 0 = none. */
  tier: number;
  maxTier: number;
  value: number;
  /** Threshold for the next tier, or null when maxed. */
  next: number | null;
  description: string;
}

export function evaluateAchievements(counts: AchievementCounts): AchievementState[] {
  return ACHIEVEMENTS.map((definition) => {
    const value = counts[definition.metric];
    const tier = definition.tiers.filter((threshold) => value >= threshold).length;
    const next = definition.tiers[tier] ?? null;
    const shown = next ?? definition.tiers[definition.tiers.length - 1];
    return {
      key: definition.key,
      name: definition.name,
      icon: definition.icon,
      tier,
      maxTier: definition.tiers.length,
      value,
      next,
      description: definition.describe.replace('{n}', String(shown)).replace('{s}', shown === 1 ? '' : 's'),
    };
  });
}
