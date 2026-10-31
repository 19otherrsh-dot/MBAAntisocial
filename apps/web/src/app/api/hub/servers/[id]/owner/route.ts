import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import HubServer from '@/models/hub/HubServer';
import HubMember from '@/models/hub/HubMember';
import { requireServer } from '@/server/modules/hub/access';

const schema = z.object({ userId: objectId });

/** Hands the server to another member. Owner only; the campus server has no owner to hand over. */
export const POST = route({ body: schema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const { ctx } = await requireServer(actor.id, params.id);
  if (!ctx.isOwner) throw ApiError.forbidden('Only the owner can hand the server over.');
  if (ctx.server.kind === 'campus') throw ApiError.badRequest('The campus server has no owner to hand over.');
  if (body.userId === actor.id) throw ApiError.badRequest('You already own it.');
  if (!(await HubMember.exists({ server: ctx.server._id, user: body.userId }))) throw ApiError.notFound('They need to be a member of the server first.');
  await HubServer.updateOne({ _id: ctx.server._id, owner: actor.id }, { $set: { owner: body.userId } });
  return ok({ owner: body.userId });
});
