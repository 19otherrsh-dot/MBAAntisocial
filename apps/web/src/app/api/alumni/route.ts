import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import ReferralRequest from '@/models/career/ReferralRequest';
import User from '@/models/User';

const querySchema = z.object({ q: z.string().trim().max(60).optional(), company: z.string().trim().max(80).optional() });

const OPEN = ['pending', 'accepted'] as const;

/**
 * Alumni who opted in to referrals, each with how much room they have left
 * this month; the caller's own sent requests; and, for alumni, their inbox.
 */
export const GET = route({ feature: 'alumni', query: querySchema }, async ({ actor, query }) => {
  const filter: Record<string, unknown> = { campus: actor.campus, role: 'alumni', 'alumniProfile.referralsOpen': true, _id: { $ne: actor.id } };
  if (query.company) filter['alumniProfile.company'] = new RegExp(query.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (query.q) filter.$or = ['name', 'alumniProfile.company', 'alumniProfile.designation'].map((f) => ({ [f]: new RegExp(query.q!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
  const alumni = await User.find(filter).select('name image alumniProfile specializations').limit(60).lean();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const load = await ReferralRequest.aggregate<{ _id: unknown; open: number; done: number }>([
    { $match: { alum: { $in: alumni.map((a) => a._id) }, createdAt: { $gte: monthStart } } },
    { $group: { _id: '$alum', open: { $sum: { $cond: [{ $in: ['$status', [...OPEN]] }, 1, 0] } }, done: { $sum: { $cond: [{ $eq: ['$status', 'referred'] }, 1, 0] } } } },
  ]);
  const loadOf = new Map(load.map((l) => [String(l._id), l]));

  const [sent, inbox] = await Promise.all([
    ReferralRequest.find({ requester: actor.id }).sort({ createdAt: -1 }).limit(30).populate<{ alum: { _id: unknown; name: string; image: string } }>('alum', 'name image').lean(),
    actor.role === 'alumni'
      ? ReferralRequest.find({ alum: actor.id, status: { $in: [...OPEN] } }).sort({ priority: -1, createdAt: 1 }).populate<{ requester: { _id: unknown; name: string; image: string; batch: string; specializations: string[] } }>('requester', 'name image batch specializations').lean()
      : Promise.resolve([]),
  ]);

  return ok({
    alumni: alumni.map((a) => {
      const l = loadOf.get(String(a._id));
      const capacity = a.alumniProfile?.referralCapacity ?? 3;
      return {
        _id: String(a._id),
        name: a.name,
        image: a.image,
        company: a.alumniProfile?.company ?? '',
        designation: a.alumniProfile?.designation ?? '',
        graduationYear: a.alumniProfile?.graduationYear ?? null,
        linkedinUrl: a.alumniProfile?.linkedinUrl ?? '',
        specializations: a.specializations ?? [],
        capacity,
        openThisMonth: l?.open ?? 0,
        referredThisMonth: l?.done ?? 0,
        available: (l?.open ?? 0) < capacity,
      };
    }),
    sent: sent.map((r) => ({ _id: String(r._id), alum: { _id: String(r.alum._id), name: r.alum.name, image: r.alum.image }, company: r.company, role: r.role, status: r.status, response: r.response, priority: r.priority, createdAt: r.createdAt })),
    inbox: inbox.map((r) => ({ _id: String(r._id), requester: { _id: String(r.requester._id), name: r.requester.name, image: r.requester.image, batch: r.requester.batch, specializations: r.requester.specializations }, company: r.company, role: r.role, jobUrl: r.jobUrl, note: r.note, resumeUrl: r.resumeUrl, priority: r.priority, status: r.status, createdAt: r.createdAt })),
    isAlum: actor.role === 'alumni',
  });
});
