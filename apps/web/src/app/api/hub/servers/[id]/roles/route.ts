import { route, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { ALL_PERMISSIONS, PERMISSIONS } from '@mba/shared/hub';
import HubRole from '@/models/hub/HubRole';
import { requireServer, serverPerms } from '@/server/modules/hub/access';
import { roleSchema } from '@/server/modules/hub/schemas';

/** Creates a role below the creator's highest, never granting more than they hold. */
export const POST = route({ body: roleSchema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const { ctx } = await requireServer(actor.id, params.id, 'MANAGE_ROLES');
  const mine = serverPerms(ctx);
  if (!ctx.isOwner && (body.permissions & ~mine & ALL_PERMISSIONS) !== 0) throw ApiError.forbidden('You cannot grant permissions you do not have.');
  if (!ctx.isOwner && (body.permissions & PERMISSIONS.ADMINISTRATOR)) throw ApiError.forbidden('Only the owner can create administrator roles.');
  const count = await HubRole.countDocuments({ server: ctx.server._id });
  if (count >= 50) throw ApiError.unprocessable('A server can have up to 50 roles.');
  const position = Math.min(body.position ?? 1, ctx.isOwner ? 1000 : Math.max(1, ctx.highestPosition - 1));
  const role = await HubRole.create({ ...body, server: ctx.server._id, position });
  return created({ role: { ...role.toObject(), _id: String(role._id) } });
});
