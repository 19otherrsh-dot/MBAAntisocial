import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import connectDB from '@/lib/mongodb';
import Whisper from '@/models/Whisper';
import { createWhisperSchema } from '@/lib/validation';
import { MIN_REPORTABLE_COHORT } from '@/lib/constants';

/**
 * Anonymous course and professor reviews.
 *
 * Two things are enforced on the way out, both because the subject is a named
 * individual rather than an institution:
 *
 *  - The author is never serialised. It is stored so moderators can act; it is
 *    not published, so the review reads as anonymous.
 *  - An aggregate rating is withheld until enough people have reviewed. A "1.2
 *    out of 5" computed from one submission is not a rating, it is one person's
 *    grievance wearing the authority of a statistic — attached to a real
 *    person's name, on a page their colleagues and students can read.
 */
const MIN_REVIEWS_TO_PUBLISH_AVERAGE = 3;

export const GET = route({}, async ({ actor }) => {
  await connectDB();

  const stats = await Whisper.aggregate([
    { $match: { campus: actor.campus, hiddenAt: { $exists: false } } },
    {
      $group: {
        _id: { targetName: '$targetName', targetType: '$targetType' },
        avgRating: { $avg: '$rating' },
        avgDifficulty: { $avg: '$difficulty' },
        avgWorkload: { $avg: '$workload' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gte: MIN_REVIEWS_TO_PUBLISH_AVERAGE } } },
    { $sort: { count: -1, avgRating: -1 } },
  ]);

  const recent = await Whisper.find({ campus: actor.campus, hiddenAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('-author -hiddenBy -hiddenReason')
    .lean();

  return ok({
    stats: stats.map((s) => ({
      targetName: s._id.targetName,
      targetType: s._id.targetType,
      avgRating: s.avgRating.toFixed(1),
      avgDifficulty: s.avgDifficulty.toFixed(1),
      avgWorkload: s.avgWorkload.toFixed(1),
      count: s.count,
    })),
    // Explicitly rebuilt rather than spread, so a field added to the schema
    // later cannot leak into the response by default.
    recent: recent.map((w) => ({
      _id: String(w._id),
      targetName: w.targetName,
      targetType: w.targetType,
      rating: w.rating,
      difficulty: w.difficulty,
      workload: w.workload,
      content: w.content,
      createdAt: w.createdAt,
    })),
    minReviews: MIN_REVIEWS_TO_PUBLISH_AVERAGE,
    minCohort: MIN_REPORTABLE_COHORT,
  });
});

export const POST = route(
  { body: createWhisperSchema, rateLimit: 'post' },
  async ({ actor, body }) => {
    try {
      const whisper = await Whisper.create({
        ...body,
        author: actor.id,
        campus: actor.campus,
      });

      // The stored row is not echoed back — returning it in a response tied to
      // this session is the one link the feature exists to avoid making.
      return created({ recorded: true, id: String(whisper._id) });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw ApiError.conflict(
          'You have already reviewed this one. Reviews are limited to one each so an average cannot be gamed.'
        );
      }
      throw error;
    }
  }
);

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  );
}
