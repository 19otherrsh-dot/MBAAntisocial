import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { canManageRole, hasPermission } from '@mba/shared/hub';
import { objectId } from '@/lib/validation';
import HubMember from '@/models/hub/HubMember';
import HubBan from '@/models/hub/HubBan';
import { requireServer } from '@/server/modules/hub/access';
import { memberActionSchema } from '@/server/modules/hub/schemas';
import { removeMember } from '@/server/modules/hub/service';

/**
 * Member management: roles (only below your own highest), nickname, timeout,
 * kick, ban. Nobody can act on the owner, and nobody acts on themselves here.
 */
export const PATCH = route({ body: memberActionSchema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const targetId = objectId.parse(params.userId);
  const { ctx, perms } = await requireServer(actor.id, params.id);
  if (String(ctx.server.owner ?? '') === targetId) throw ApiError.forbidden('The owner cannot be moderated.');
  const self = targetId === actor.id;

  const target = await HubMember.findOne({ server: ctx.server._id, user: targetId });
  if (!target && body.action !== 'unban') throw ApiError.notFound('That person is not a member.');

  if (body.nickname !== undefined) {
    if (!self && !hasPermission(perms, 'MANAGE_ROLES')) throw ApiError.forbidden();
    target!.nickname = body.nickname;
  }

  if (body.roles) {
    if (!hasPermission(perms, 'MANAGE_ROLES')) throw ApiError.forbidden('Only server managers can change roles.');
    const current = new Set(target!.roles.map(String));
    const next = new Set(body.roles);
    const changed = [...new Set([...current, ...next])].filter((id) => current.has(id) !== next.has(id));
    for (const roleId of changed) {
      const role = ctx.roles.get(roleId);
      if (!role || role.isEveryone || role.managedBy) throw ApiError.badRequest('That role cannot be assigned by hand.');
      if (!canManageRole(ctx.highestPosition, role.position, ctx.isOwner || ctx.isCampusModerator)) {
        throw ApiError.forbidden('You can only manage roles below your own.');
      }
    }
    target!.roles = body.roles as never;
  }

  if (body.timeoutMinutes !== undefined) {
    if (self || !hasPermission(perms, 'MODERATE_MEMBERS')) throw ApiError.forbidden('Only moderators can time people out.');
    target!.timedOutUntil = body.timeoutMinutes > 0 ? new Date(Date.now() + body.timeoutMinutes * 60_000) : undefined;
  }

  if (target) await target.save();

  if (body.action === 'kick' || body.action === 'ban') {
    if (self) throw ApiError.badRequest('Leave the server instead.');
    if (!hasPermission(perms, body.action === 'ban' ? 'BAN_MEMBERS' : 'KICK_MEMBERS')) throw ApiError.forbidden();
    if (ctx.server.kind === 'campus' && body.action === 'kick') throw ApiError.badRequest('Campus members can be timed out or banned, not kicked.');
    await removeMember(String(ctx.server._id), targetId);
    if (body.action === 'ban') {
      await HubBan.updateOne({ server: ctx.server._id, user: targetId }, { $set: { by: actor.id, reason: body.reason } }, { upsert: true });
    }
  }
  if (body.action === 'unban') {
    if (!hasPermission(perms, 'BAN_MEMBERS')) throw ApiError.forbidden();
    await HubBan.deleteOne({ server: ctx.server._id, user: targetId });
  }

  return ok({ updated: true });
});
