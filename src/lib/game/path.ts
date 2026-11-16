import type { AchievementCounts } from './achievements';

/**
 * The season path: an ordered run of milestones from "just arrived" to
 * "placement ready", drawn as a winding trail. One step is current; the ones
 * after it are visible but locked, so there is always exactly one obvious next
 * thing to do. Each step pays a one-off bonus when claimed.
 */
export interface PathCounts extends AchievementCounts {
  hasBio: boolean;
  applications: number;
  level: number;
  hostingOn: boolean;
}

export interface PathStepDefinition {
  key: string;
  title: string;
  hint: string;
  href: string;
  xp: number;
  done: (counts: PathCounts) => boolean;
  /** A milestone on the trail, drawn larger. */
  milestone?: boolean;
}

const STUDENT_PATH: PathStepDefinition[] = [
  { key: 's_profile', title: 'Say who you are', hint: 'Add a line about what you are aiming for.', href: '/profile', xp: 10, done: (c) => c.hasBio },
  { key: 's_track', title: 'Track your first company', hint: 'Pipeline shows what your campus was asked there.', href: '/pipeline', xp: 15, done: (c) => c.applications >= 1 },
  { key: 's_ai', title: 'Warm up with the AI interviewer', hint: 'Finish one AI mock and get a scorecard.', href: '/ai-interview', xp: 20, done: (c) => c.aiDebriefs >= 1 },
  { key: 's_streak3', title: 'Show up three days running', hint: 'Open the app and do one thing a day.', href: '/home', xp: 20, done: (c) => c.longestStreak >= 3, milestone: true },
  { key: 's_mock', title: 'Do a mock with a senior', hint: 'Book a slot and turn up. Nothing beats a real panel.', href: '/sessions', xp: 40, done: (c) => c.sessionsAttended >= 1 },
  { key: 's_closer', title: 'Clear five tasks', hint: 'Deadlines are easier ticked off than remembered.', href: '/tasks', xp: 25, done: (c) => c.tasksCompleted >= 5 },
  { key: 's_intel', title: 'Log what a panel asked', hint: 'The most useful thing you can leave behind.', href: '/intel', xp: 40, done: (c) => c.questionsLogged >= 1, milestone: true },
  { key: 's_share', title: 'Share your notes', hint: 'One upload helps a whole section.', href: '/resources', xp: 30, done: (c) => c.resourcesShared >= 1 },
  { key: 's_streak7', title: 'Hold a 7-day streak', hint: 'A week of small things adds up.', href: '/home', xp: 40, done: (c) => c.longestStreak >= 7 },
  { key: 's_mock3', title: 'Three mocks down', hint: 'By the third, the nerves are gone.', href: '/sessions', xp: 60, done: (c) => c.sessionsAttended >= 3, milestone: true },
  { key: 's_level5', title: 'Reach level 5', hint: 'Shortlisted. Keep going.', href: '/path', xp: 50, done: (c) => c.level >= 5 },
  { key: 's_intel5', title: 'Log five questions', hint: 'Your debriefs are a junior’s prep sheet.', href: '/intel', xp: 60, done: (c) => c.questionsLogged >= 5 },
  { key: 's_ready', title: 'Placement ready', hint: 'Ten mocks, a deep pipeline, a 30-day habit.', href: '/path', xp: 150, done: (c) => c.sessionsAttended >= 10 && c.longestStreak >= 30, milestone: true },
];

const MENTOR_PATH: PathStepDefinition[] = [
  { key: 'm_profile', title: 'Tell juniors what you are good for', hint: 'A headline and a line of bio.', href: '/profile', xp: 10, done: (c) => c.hasBio },
  { key: 'm_hosting', title: 'Open your door', hint: 'Turn on hosting and set your weekly cap.', href: '/profile', xp: 20, done: (c) => c.hostingOn },
  { key: 'm_host1', title: 'Host your first mock', hint: 'Publish a slot. Someone will take it.', href: '/sessions?view=hosting', xp: 50, done: (c) => c.sessionsHosted >= 1, milestone: true },
  { key: 'm_intel', title: 'Log what your panel asked', hint: 'Your summers interviews are gold to a junior.', href: '/intel', xp: 40, done: (c) => c.questionsLogged >= 1 },
  { key: 'm_share', title: 'Share your notes', hint: 'Last year’s best notes, this year’s lifeline.', href: '/resources', xp: 30, done: (c) => c.resourcesShared >= 1 },
  { key: 'm_host5', title: 'Host five mocks', hint: 'Five juniors who walk in better prepared.', href: '/sessions?view=hosting', xp: 80, done: (c) => c.sessionsHosted >= 5, milestone: true },
  { key: 'm_useful', title: 'Answer questions on the feed', hint: 'Get three answers marked useful.', href: '/feed', xp: 40, done: (c) => c.answersUseful >= 3 },
  { key: 'm_intel5', title: 'Log five questions', hint: 'Build the bank you wish you had.', href: '/intel', xp: 60, done: (c) => c.questionsLogged >= 5 },
  { key: 'm_legend', title: 'Campus legend', hint: 'Twenty-five mocks hosted. The batch owes you.', href: '/path', xp: 200, done: (c) => c.sessionsHosted >= 25, milestone: true },
];

export function pathFor(isMentor: boolean): PathStepDefinition[] {
  return isMentor ? MENTOR_PATH : STUDENT_PATH;
}
