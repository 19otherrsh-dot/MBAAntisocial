import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import HubServer from '@/models/hub/HubServer';
import { requireServer } from '@/server/modules/hub/access';
import { updateServerSchema } from '@/server/modules/hub/schemas';
import { serverDetail } from '@/server/modules/hub/detail';

/** A server with the channels the caller can see, unread state, roles, and their permissions. */
export const GET = route({ feature: 'hub' }, async ({ actor, params }) => ok(await serverDetail(actor.id, params.id)));

export const PATCH = route({ body: updateServerSchema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const { ctx } = await requireServer(actor.id, params.id, 'MANAGE_SERVER');
  if (ctx.server.kind === 'campus' && body.name) throw ApiError.badRequest('The campus server keeps its name.');
  await HubServer.updateOne({ _id: ctx.server._id }, { $set: body });
  return ok({ updated: true });
});

/** Archives a server (owner only). Messages are kept for moderation. */
export const DELETE = route({ rateLimit: 'write', feature: 'hub' }, async ({ actor, params }) => {
  const { ctx } = await requireServer(actor.id, params.id);
  if (!ctx.isOwner || ctx.server.kind === 'campus') throw ApiError.forbidden('Only the owner can archive this server.');
  await HubServer.updateOne({ _id: ctx.server._id }, { $set: { archivedAt: new Date() } });
  return ok({ archived: true });
});
