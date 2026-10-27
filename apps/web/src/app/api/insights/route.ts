import { route, ok } from '@/lib/api/handler';
import Offer from '@/models/Offer';
import Application from '@/models/Application';
import InterviewQuestion from '@/models/InterviewQuestion';
import Job from '@/models/Job';

/** Groups smaller than this are reported as "not enough data" — no one is identifiable. */
const MIN_SAMPLE = 3;

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Campus-level placement patterns: pay by track, how far applications get,
 * which rounds and topics come up, and what opportunities ask for. All
 * aggregated, never per person.
 */
export const GET = route({ feature: 'opportunities' }, async ({ actor }) => {
  const campus = actor.campus;
  const [offers, stages, rounds, tags, jobs] = await Promise.all([
    Offer.find({ campus }).select('track offerType baseSalary company').lean(),
    Application.aggregate<{ _id: string; count: number }>([{ $match: { campus } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    InterviewQuestion.aggregate<{ _id: string; count: number }>([{ $match: { campus } }, { $group: { _id: '$roundType', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    InterviewQuestion.aggregate<{ _id: string; count: number }>([{ $match: { campus } }, { $unwind: '$tags' }, { $group: { _id: { $toLower: '$tags' }, count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
    Job.aggregate<{ _id: string; count: number }>([{ $match: { campus, isActive: true } }, { $group: { _id: '$kind', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
  ]);

  const byTrack = new Map<string, number[]>();
  for (const o of offers.filter((x) => x.offerType === 'full_time')) byTrack.set(o.track, [...(byTrack.get(o.track) ?? []), o.baseSalary]);
  const tracks = [...byTrack.entries()]
    .map(([track, pay]) => ({ track, count: pay.length, median: pay.length >= MIN_SAMPLE ? median(pay) : null, p25: pay.length >= MIN_SAMPLE * 2 ? [...pay].sort((a, b) => a - b)[Math.floor(pay.length / 4)] : null, p75: pay.length >= MIN_SAMPLE * 2 ? [...pay].sort((a, b) => a - b)[Math.floor((pay.length * 3) / 4)] : null }))
    .sort((a, b) => (b.median ?? 0) - (a.median ?? 0));

  const stageCount = Object.fromEntries(stages.map((s) => [s._id, s.count]));
  const total = stages.reduce((n, s) => n + s.count, 0);
  return ok({
    offers: { total: offers.length, tracks, minSample: MIN_SAMPLE },
    funnel: { total, stages: stageCount },
    rounds: rounds.map((r) => ({ round: r._id, count: r.count })),
    topics: tags.map((t) => ({ tag: t._id, count: t.count })),
    opportunities: jobs.map((j) => ({ kind: j._id, count: j.count })),
  });
});
