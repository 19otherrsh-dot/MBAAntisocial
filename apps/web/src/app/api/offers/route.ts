import { route, ok, created } from '@/lib/api/handler';
import connectDB from '@/lib/mongodb';
import Offer from '@/models/Offer';
import { createOfferSchema } from '@/lib/validation';
import { MIN_REPORTABLE_COHORT } from '@/lib/constants';

/**
 * Anonymous offer reporting.
 *
 * Nothing here stores who submitted what — the schema has no user reference at
 * all. But storage anonymity is only half the problem: on a single campus,
 * "Associate at a named firm, this city, this exact figure, three days ago"
 * frequently describes exactly one person, and publishing it verbatim would
 * re-identify them no matter what the database holds.
 *
 * So two further rules apply on the way out:
 *
 *  - Per-track benchmarks are withheld below `MIN_REPORTABLE_COHORT`. An
 *    average over one submission is that person's salary with a label on it.
 *  - Individual reports publish a band rather than an exact figure, and no
 *    submission timestamp finer than the month.
 */

/** Rounds a figure into a band wide enough to stop it identifying one person. */
function toBand(value: number): { low: number; high: number } {
  const step = value >= 1_000_000 ? 100_000 : value >= 100_000 ? 10_000 : 5_000;
  const low = Math.floor(value / step) * step;
  return { low, high: low + step };
}

export const GET = route({}, async ({ actor }) => {
  await connectDB();

  const stats = await Offer.aggregate([
    { $match: { campus: actor.campus } },
    {
      $group: {
        _id: { track: '$track', offerType: '$offerType' },
        avgBase: { $avg: '$baseSalary' },
        maxBase: { $max: '$baseSalary' },
        avgBonus: { $avg: '$signingBonus' },
        count: { $sum: 1 },
      },
    },
    // Withheld in the pipeline rather than filtered in the UI, so a thin
    // benchmark never leaves the server in the first place.
    { $match: { count: { $gte: MIN_REPORTABLE_COHORT } } },
    { $sort: { avgBase: -1 } },
  ]);

  const recent = await Offer.find({ campus: actor.campus })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const totalReports = await Offer.countDocuments({ campus: actor.campus });

  return ok({
    stats: stats.map((s) => ({
      track: s._id.track,
      offerType: s._id.offerType,
      avgBase: Math.round(s.avgBase),
      maxBase: s.maxBase,
      avgBonus: Math.round(s.avgBonus),
      count: s.count,
    })),
    recent: recent.map((offer) => {
      const base = toBand(offer.baseSalary);
      return {
        _id: String(offer._id),
        company: offer.company,
        role: offer.role,
        location: offer.location,
        track: offer.track,
        offerType: offer.offerType,
        baseBand: base,
        hasBonus: offer.signingBonus > 0,
        // Month precision only. A day-level timestamp plus a company name is
        // enough for a batch to work out who.
        reportedMonth: new Date(offer.createdAt).toISOString().slice(0, 7),
      };
    }),
    totalReports,
    minCohort: MIN_REPORTABLE_COHORT,
    suppressedTracks: totalReports > 0 && stats.length === 0,
  });
});

export const POST = route(
  // Rate limited: a salary benchmark is something people negotiate against, so
  // a handful of fabricated submissions could move a number that changes what
  // someone accepts. Validation goes through the wrapper for a consistent 422.
  { body: createOfferSchema, rateLimit: 'post' },
  async ({ actor, body }) => {
    const offer = await Offer.create({
      ...body,
      campus: actor.campus,
      createdAt: new Date(),
    });

    // The created row is deliberately not echoed back — returning it would put
    // the submitter's exact figure in a response tied to their session, which
    // is the one link this feature promises not to make.
    return created({ recorded: true, id: String(offer._id) });
  }
);
