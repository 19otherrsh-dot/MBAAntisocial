/**
 * Levels. XP is the sum of both ledgers — points for looking after yourself,
 * karma for looking after everyone else — so helping your campus levels you up
 * as surely as doing your own work. Pure, shared by server and browser.
 */

/** Total XP needed to *reach* `level`. Level 1 starts at 0; each step is 50 XP longer. */
export function xpForLevel(level: number): number {
  return 25 * level * (level - 1);
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  title: string;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  span: number;
  /** 0–1. */
  fraction: number;
  toNext: number;
}

const TITLES: Array<[number, string]> = [
  [1, 'Fresher'],
  [3, 'Case Cracker'],
  [5, 'Shortlisted'],
  [8, 'Group Discussion Gladiator'],
  [11, 'Day Zero Ready'],
  [15, 'Placement Pro'],
  [20, 'Campus Legend'],
  [30, 'Alumni Energy'],
];

export function titleForLevel(level: number): string {
  let title = TITLES[0][1];
  for (const [from, name] of TITLES) if (level >= from) title = name;
  return title;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const span = xpForLevel(level + 1) - floor;
  const into = xp - floor;
  return { level, title: titleForLevel(level), into, span, fraction: into / span, toNext: span - into };
}

/** Daily XP goals a user can pick, gentlest first. */
export const DAILY_GOALS = [
  { xp: 20, label: 'Easy', blurb: 'A task or two' },
  { xp: 40, label: 'Steady', blurb: 'A task and a bit of prep' },
  { xp: 70, label: 'Serious', blurb: 'Placement season mode' },
  { xp: 120, label: 'All in', blurb: 'Day Zero is next week' },
] as const;

export const DEFAULT_DAILY_GOAL = 40;
