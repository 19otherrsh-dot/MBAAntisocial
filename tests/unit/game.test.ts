import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelForXp, levelProgress, xpForLevel, titleForLevel } from '@/lib/game/levels';
import { questsFor, QUEST_POOL, QUESTS_PER_DAY } from '@/lib/game/quests';
import { evaluateAchievements, type AchievementCounts } from '@/lib/game/achievements';
import { pathFor } from '@/lib/game/path';
import { stableId } from '@/lib/game/ids';
import { POINT_RULES } from '@/lib/constants';

const ZERO: AchievementCounts = {
  longestStreak: 0,
  questionsLogged: 0,
  sessionsHosted: 0,
  sessionsAttended: 0,
  tasksCompleted: 0,
  resourcesShared: 0,
  aiDebriefs: 0,
  answersUseful: 0,
};

test('levels: thresholds grow, and progress is consistent', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 50);
  assert.equal(xpForLevel(3), 150);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(49), 1);
  assert.equal(levelForXp(50), 2);
  assert.equal(levelForXp(149), 2);
  const progress = levelProgress(100);
  assert.equal(progress.level, 2);
  assert.equal(progress.into + progress.toNext, progress.span);
  assert.equal(titleForLevel(1), 'Fresher');
  assert.equal(titleForLevel(5), 'Shortlisted');
});

test('quests: three a day, stable per person and day, different across days', () => {
  const a = questsFor('user-a', '2026-03-10', false);
  assert.equal(a.length, QUESTS_PER_DAY);
  assert.deepEqual(questsFor('user-a', '2026-03-10', false), a);
  assert.equal(new Set(a.map((quest) => quest.key)).size, QUESTS_PER_DAY);
  const week = new Set(
    ['10', '11', '12', '13', '14'].flatMap((d) => questsFor('user-a', `2026-03-${d}`, false).map((q) => q.key))
  );
  assert.ok(week.size > QUESTS_PER_DAY, 'quests rotate');
});

test('quests: mentors never get student-only quests and vice versa', () => {
  for (const day of ['2026-03-10', '2026-03-11', '2026-03-12']) {
    assert.ok(questsFor('m', day, true).every((quest) => quest.audience !== 'students'));
    assert.ok(questsFor('s', day, false).every((quest) => quest.audience !== 'mentors'));
  }
});

test('every quest counts actions that exist in the ledger rules', () => {
  for (const quest of QUEST_POOL) {
    for (const action of quest.actions) assert.ok(action in POINT_RULES, `${quest.key}: ${action}`);
  }
});

test('achievements: tiers, next threshold, plurals', () => {
  const states = evaluateAchievements({ ...ZERO, longestStreak: 8, sessionsHosted: 1 });
  const wildfire = states.find((s) => s.key === 'wildfire')!;
  assert.equal(wildfire.tier, 2);
  assert.equal(wildfire.next, 14);
  const door = states.find((s) => s.key === 'open_door')!;
  assert.equal(door.description, 'Host 5 mocks');
  const field = states.find((s) => s.key === 'field_notes')!;
  assert.equal(field.description, 'Log 1 interview question');
});

test('the path is ordered and every step is reachable', () => {
  for (const isMentor of [false, true]) {
    const steps = pathFor(isMentor);
    assert.ok(steps.length >= 8);
    assert.equal(new Set(steps.map((step) => step.key)).size, steps.length);
    const everything = { ...ZERO, longestStreak: 999, questionsLogged: 999, sessionsHosted: 999, sessionsAttended: 999, tasksCompleted: 999, resourcesShared: 999, aiDebriefs: 999, answersUseful: 999, hasBio: true, applications: 9, level: 99, hostingOn: true };
    assert.ok(steps.every((step) => step.done(everything)));
  }
});

test('reward ids are stable per key and distinct across keys', () => {
  assert.equal(String(stableId('quest:u:2026-03-10:tasks')), String(stableId('quest:u:2026-03-10:tasks')));
  assert.notEqual(String(stableId('quest:u:2026-03-10:tasks')), String(stableId('quest:u:2026-03-11:tasks')));
});
