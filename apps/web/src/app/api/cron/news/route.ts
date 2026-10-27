import { cronRoute, ok } from '@/lib/api/handler';
import { ensureQuiz, refreshBriefing } from '@/server/modules/briefing/service';

/** Hourly: pull feeds into the briefing; build the day's quiz once there is enough news. */
export const GET = cronRoute(async () => {
  const briefing = await refreshBriefing();
  const quiz = await ensureQuiz(briefing.day);
  return ok({ ...briefing, quizSource: quiz.source });
});
