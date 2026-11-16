import { route, ok } from '@/lib/api/handler';
import InterviewQuestion from '@/models/InterviewQuestion';
import InterviewSlot from '@/models/InterviewSlot';
import Resource from '@/models/Resource';
import { seasonStart, seasonLabel, goalProgress } from '@/lib/season';
import { DAY_MS } from '@/lib/time';

/**
 * The campus working together, as one number going up.
 *
 * The leaderboard ranks people against each other, which is why it is opt-in.
 * This is the opposite: a goal the whole batch shares, where every logged
 * question moves everyone's bar and nobody is placed above anyone else. It
 * reports totals only, never who contributed what.
 */
export const GET = route({}, async ({ actor }) => {
  const since = seasonStart();
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);
  const campus = actor.campus;
  const visible = { campus, hiddenAt: { $exists: false } };

  const [questions, questionsThisWeek, mocks, resources, questionPeople, mentorPeople, resourcePeople] =
    await Promise.all([
      InterviewQuestion.countDocuments({ ...visible, createdAt: { $gte: since } }),
      InterviewQuestion.countDocuments({ ...visible, createdAt: { $gte: weekAgo } }),
      InterviewSlot.countDocuments({ campus, status: 'completed', completedAt: { $gte: since } }),
      Resource.countDocuments({ ...visible, createdAt: { $gte: since } }),
      InterviewQuestion.distinct('contributor', { ...visible, createdAt: { $gte: since } }),
      InterviewSlot.distinct('mentor', { campus, status: 'completed', completedAt: { $gte: since } }),
      Resource.distinct('author', { ...visible, createdAt: { $gte: since } }),
    ]);

  const contributors = new Set([...questionPeople, ...mentorPeople, ...resourcePeople].map(String));

  return ok({
    season: seasonLabel(),
    questions,
    questionsThisWeek,
    mocks,
    resources,
    contributors: contributors.size,
    goal: goalProgress(questions),
  });
});
