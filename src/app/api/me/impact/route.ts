import { Types } from 'mongoose';
import { route, ok } from '@/lib/api/handler';
import InterviewQuestion from '@/models/InterviewQuestion';
import Resource from '@/models/Resource';
import InterviewSlot from '@/models/InterviewSlot';
import LedgerEntry from '@/models/LedgerEntry';

/**
 * What the caller's contributions have done for other people.
 *
 * Karma is a number; this is the thing the number stands for. "You have 340
 * karma" means little. "Your questions were marked useful 14 times and you have
 * helped 9 people" is the reason anyone writes a debrief at midnight after a
 * final round. Everything here is about the caller's own contributions — no
 * other person's activity is exposed beyond a count.
 */
export const GET = route({}, async ({ actor }) => {
  const me = new Types.ObjectId(actor.id);

  const [questionTotals, resourceTotals, questionUpvoters, resourceUpvoters, mentees, answersUseful] =
    await Promise.all([
      InterviewQuestion.aggregate<{ count: number; upvotes: number }>([
        { $match: { contributor: me, hiddenAt: { $exists: false } } },
        { $group: { _id: null, count: { $sum: 1 }, upvotes: { $sum: '$upvoteCount' } } },
      ]),
      Resource.aggregate<{ count: number; upvotes: number; downloads: number }>([
        { $match: { author: me, hiddenAt: { $exists: false } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            upvotes: { $sum: '$upvoteCount' },
            downloads: { $sum: '$downloads' },
          },
        },
      ]),
      InterviewQuestion.distinct('upvotes', { contributor: me, hiddenAt: { $exists: false } }),
      Resource.distinct('upvotes', { author: me, hiddenAt: { $exists: false } }),
      InterviewSlot.distinct('bookedBy', { mentor: me, status: 'completed' }),
      LedgerEntry.countDocuments({ user: me, action: 'answer_marked_useful' }),
    ]);

  // Distinct people, counted once however many ways they were helped.
  const helped = new Set<string>();
  for (const id of [...questionUpvoters, ...resourceUpvoters, ...mentees]) {
    if (id && String(id) !== actor.id) helped.add(String(id));
  }

  const questions = questionTotals[0] ?? { count: 0, upvotes: 0 };
  const resources = resourceTotals[0] ?? { count: 0, upvotes: 0, downloads: 0 };

  return ok({
    peopleHelped: helped.size,
    questionsLogged: questions.count,
    questionUpvotes: questions.upvotes,
    resourcesShared: resources.count,
    resourceUpvotes: resources.upvotes,
    resourceDownloads: resources.downloads,
    sessionsHosted: mentees.length,
    answersMarkedUseful: answersUseful,
  });
});
