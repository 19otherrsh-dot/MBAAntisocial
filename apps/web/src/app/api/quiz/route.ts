import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { award } from '@/lib/gamification';
import { QuizAttempt } from '@/models/career/Quiz';
import { ensureQuiz, istDay } from '@/server/modules/briefing/service';

/**
 * Today's five questions. Answers and explanations are only sent once the
 * caller has submitted, so the quiz cannot be read off the network tab.
 */
export const GET = route({ feature: 'quiz' }, async ({ actor }) => {
  const day = istDay();
  const quiz = await ensureQuiz(day);
  const [attempt, board, streakDays] = await Promise.all([
    QuizAttempt.findOne({ user: actor.id, day }).lean(),
    QuizAttempt.find({ campus: actor.campus, day }).sort({ score: -1, completedAt: 1 }).limit(10).populate<{ user: { _id: unknown; name: string; image: string } }>('user', 'name image').lean(),
    QuizAttempt.find({ user: actor.id }).sort({ day: -1 }).limit(60).select('day').lean(),
  ]);
  // Consecutive days played, ending today or yesterday.
  let streak = 0;
  const cursor = new Date(`${day}T12:00:00Z`);
  if (!streakDays.some((d) => d.day === day)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  const played = new Set(streakDays.map((d) => d.day));
  while (played.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return ok({
    day,
    source: quiz.source,
    questions: quiz.questions.map((q) => ({
      prompt: q.prompt,
      options: q.options,
      category: q.category,
      ...(attempt ? { answerIndex: q.answerIndex, explanation: q.explanation } : {}),
    })),
    attempt: attempt ? { answers: attempt.answers, score: attempt.score } : null,
    leaderboard: board.map((a, i) => ({ rank: i + 1, user: { _id: String(a.user._id), name: a.user.name, image: a.user.image }, score: a.score })),
    streak,
  });
});

const schema = z.object({ answers: z.array(z.number().int().min(-1).max(3)).length(5) });

export const POST = route({ feature: 'quiz', body: schema, rateLimit: 'write' }, async ({ actor, body }) => {
  const day = istDay();
  const quiz = await ensureQuiz(day);
  const score = quiz.questions.reduce((n, q, i) => n + (body.answers[i] === q.answerIndex ? 1 : 0), 0);
  try {
    await QuizAttempt.create({ user: actor.id, campus: actor.campus, day, answers: body.answers, score });
  } catch {
    throw ApiError.conflict('You have already played today. Come back tomorrow.');
  }
  await award(actor.id, 'quiz_completed');
  if (score === quiz.questions.length) await award(actor.id, 'quiz_perfect');
  return ok({ score, answers: quiz.questions.map((q) => ({ answerIndex: q.answerIndex, explanation: q.explanation })) });
});
