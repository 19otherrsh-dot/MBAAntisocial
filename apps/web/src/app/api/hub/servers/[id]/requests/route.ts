import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { notify } from '@/lib/notifications';
import HubJoinRequest from '@/models/hub/HubJoinRequest';
import { requireServer } from '@/server/modules/hub/access';
import { addMember } from '@/server/modules/hub/service';

export const GET = route({ feature: 'hub' }, async ({ actor, params }) => {
  const { ctx } = await requireServer(actor.id, params.id, 'KICK_MEMBERS');
  const requests = await HubJoinRequest.find({ server: ctx.server._id }).sort({ createdAt: 1 }).populate('user', 'name image batch year').lean();
  return ok({ requests: requests.map((r) => ({ ...r, _id: String(r._id) })) });
});

const schema = z.object({ userId: z.string().regex(/^[a-f0-9]{24}$/), approve: z.boolean() });

export const PATCH = route({ body: schema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const { ctx } = await requireServer(actor.id, params.id, 'KICK_MEMBERS');
  const request = await HubJoinRequest.findOneAndDelete({ server: ctx.server._id, user: body.userId });
  if (request && body.approve) {
    await addMember(String(ctx.server._id), body.userId);
    await notify({ user: body.userId, kind: 'club_update', title: `You’re in ${ctx.server.name}`, href: `/hub/${ctx.server._id}`, actor: actor.id });
  }
  return ok({ handled: true });
});
