import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import { award } from '@/lib/gamification';
import { notify } from '@/lib/notifications';
import ReferralRequest from '@/models/career/ReferralRequest';
import { earnCredits } from '@/server/modules/credits/service';

const schema = z.object({ action: z.enum(['accept', 'referred', 'decline', 'withdraw']), response: z.string().trim().max(1000).default('') });

const TRANSITIONS = {
  accept: { from: ['pending'], to: 'accepted', by: 'alum' },
  referred: { from: ['pending', 'accepted'], to: 'referred', by: 'alum' },
  decline: { from: ['pending', 'accepted'], to: 'declined', by: 'alum' },
  withdraw: { from: ['pending', 'accepted'], to: 'withdrawn', by: 'requester' },
} as const;

export const POST = route({ feature: 'alumni', body: schema, rateLimit: 'write' }, async ({ actor, params, body }) => {
  const rule = TRANSITIONS[body.action];
  const request = await ReferralRequest.findOne({ _id: objectId.parse(params.id), campus: actor.campus });
  if (!request) throw ApiError.notFound('That request does not exist.');
  const isAlum = String(request.alum) === actor.id;
  const isRequester = String(request.requester) === actor.id;
  if ((rule.by === 'alum' && !isAlum) || (rule.by === 'requester' && !isRequester)) throw ApiError.forbidden('That is not yours to change.');
  if (!(rule.from as readonly string[]).includes(request.status)) throw ApiError.conflict(`This request is already ${request.status}.`);

  request.status = rule.to;
  if (rule.by === 'alum') {
    request.response = body.response;
    request.respondedAt = new Date();
  }
  await request.save();

  if (rule.to === 'referred') {
    await award(actor.id, 'referral_given', { entityType: 'ReferralRequest', entity: request._id });
    await earnCredits(actor.id, 'referral_given', String(request._id)).catch(() => undefined);
  }
  if (rule.by === 'alum') {
    const titles = { accepted: 'is looking at your referral request', referred: 'referred you!', declined: 'could not refer you this time' } as const;
    await notify({ user: request.requester, kind: 'referral_update', title: `${actor.name} ${titles[rule.to as keyof typeof titles]}`, body: body.response || `${request.role} at ${request.company}`, href: '/alumni?tab=sent', actor: actor.id, entityType: 'ReferralRequest', entity: request._id });
  }
  return ok({ status: request.status });
});
