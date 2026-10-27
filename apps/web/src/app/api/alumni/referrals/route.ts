import { z } from 'zod';
import { route, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import { notify } from '@/lib/notifications';
import ReferralRequest from '@/models/career/ReferralRequest';
import User from '@/models/User';
import { container } from '@/server/container';
import { spendCredits } from '@/server/modules/credits/service';

const MAX_OPEN_PER_REQUESTER = 3;

const schema = z.object({
  alum: objectId,
  company: z.string().trim().min(2).max(120),
  role: z.string().trim().min(2).max(120),
  jobUrl: z.union([z.literal(''), z.string().url().max(500)]).default(''),
  note: z.string().trim().min(40, 'Tell them a little about why you fit — a few sentences.').max(1500),
  resumeUrl: z.string().max(500).default(''),
  priority: z.boolean().default(false),
});

export const POST = route({ feature: 'alumni', body: schema, rateLimit: 'write' }, async ({ actor, body }) => {
  if (body.alum === actor.id) throw ApiError.badRequest('You cannot refer yourself.');
  const alum = await User.findOne({ _id: body.alum, campus: actor.campus, role: 'alumni', 'alumniProfile.referralsOpen': true }).select('name alumniProfile').lean();
  if (!alum) throw ApiError.notFound('That alum is not taking referral requests right now.');
  if (body.resumeUrl && !container().storage.isOwnUrl(body.resumeUrl)) throw ApiError.badRequest('Upload your resume here rather than linking it.');

  const open = await ReferralRequest.countDocuments({ requester: actor.id, status: { $in: ['pending', 'accepted'] } });
  if (open >= MAX_OPEN_PER_REQUESTER) throw ApiError.unprocessable(`You have ${open} open requests. Wait for a reply or withdraw one first.`);
  if (await ReferralRequest.exists({ requester: actor.id, alum: body.alum, company: new RegExp(`^${body.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), status: { $in: ['pending', 'accepted'] } })) {
    throw ApiError.conflict('You already have an open request with them for this company.');
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const alumLoad = await ReferralRequest.countDocuments({ alum: body.alum, status: { $in: ['pending', 'accepted'] }, createdAt: { $gte: monthStart } });
  if (alumLoad >= (alum.alumniProfile?.referralCapacity ?? 3)) throw ApiError.conflict(`${alum.name} has a full inbox this month. Try another alum, or next month.`);

  const request = await ReferralRequest.create({ ...body, campus: actor.campus, requester: actor.id, priority: false });
  if (body.priority) {
    try {
      await spendCredits(actor.id, 'referral_priority', String(request._id));
      await ReferralRequest.updateOne({ _id: request._id }, { $set: { priority: true } });
    } catch (error) {
      await ReferralRequest.deleteOne({ _id: request._id });
      throw error;
    }
  }
  await notify({ user: body.alum, kind: 'referral_update', title: `${actor.name} asked for a referral${body.priority ? ' (priority)' : ''}`, body: `${body.role} at ${body.company}`, href: '/alumni?tab=inbox', actor: actor.id, entityType: 'ReferralRequest', entity: request._id });
  return created({ request: { _id: String(request._id) } });
});
