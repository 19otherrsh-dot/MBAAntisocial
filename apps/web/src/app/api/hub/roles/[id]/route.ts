import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { ALL_PERMISSIONS, PERMISSIONS, canManageRole } from '@mba/shared/hub';
import { objectId } from '@/lib/validation';
import HubRole from '@/models/hub/HubRole';
import HubMember from '@/models/hub/HubMember';
import { requireServer, serverPerms } from '@/server/modules/hub/access';
import { roleSchema } from '@/server/modules/hub/schemas';

async function load(actorId: string, roleId: string) {
  const role = await HubRole.findById(objectId.parse(roleId));
  if (!role) throw ApiError.notFound('That role does not exist.');
  const { ctx } = await requireServer(actorId, String(role.server), 'MANAGE_ROLES');
  if (!canManageRole(ctx.highestPosition, role.position, ctx.isOwner || ctx.isCampusModerator)) throw ApiError.forbidden('You can only manage roles below your own.');
  return { role, ctx };
}

export const PATCH = route({ body: roleSchema.partial(), rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const { role, ctx } = await load(actor.id, params.id);
  if (role.isEveryone && body.name) throw ApiError.badRequest('@everyone cannot be renamed.');
  if (body.permissions !== undefined) {
    const mine = serverPerms(ctx);
    if (!ctx.isOwner && (body.permissions & ~mine & ALL_PERMISSIONS) !== 0) throw ApiError.forbidden('You cannot grant permissions you do not have.');
    if (!ctx.isOwner && (body.permissions & PERMISSIONS.ADMINISTRATOR)) throw ApiError.forbidden('Only the owner can grant administrator.');
  }
  if (body.position !== undefined && !ctx.isOwner) body.position = Math.min(body.position, Math.max(1, ctx.highestPosition - 1));
  Object.assign(role, body);
  await role.save();
  return ok({ updated: true });
});

export const DELETE = route({ rateLimit: 'write', feature: 'hub' }, async ({ actor, params }) => {
  const { role } = await load(actor.id, params.id);
  if (role.isEveryone || role.managedBy) throw ApiError.badRequest('That role cannot be deleted.');
  await HubMember.updateMany({ server: role.server }, { $pull: { roles: role._id } });
  await role.deleteOne();
  return ok({ deleted: true });
});
