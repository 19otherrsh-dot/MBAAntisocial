import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { hasPermission, permissionNames } from '@mba/shared/hub';
import HubServer from '@/models/hub/HubServer';
import HubChannel from '@/models/hub/HubChannel';
import HubReadState from '@/models/hub/HubReadState';
import { channelPerms, requireServer } from '@/server/modules/hub/access';
import { updateServerSchema } from '@/server/modules/hub/schemas';
import { botInviteUrl } from '@/server/modules/hub/discord';

/** A server with the channels the caller can see, unread state, roles, and their permissions. */
export const GET = route({ feature: 'hub' }, async ({ actor, params }) => {
  const { ctx, perms } = await requireServer(actor.id, params.id);
  const channels = await HubChannel.find({ server: ctx.server._id, archivedAt: { $exists: false } }).select('+discord.webhookUrl').sort({ position: 1 }).lean();
  const visible = channels
    .map((c) => ({ channel: c, perms: channelPerms(ctx, c) }))
    .filter((c) => hasPermission(c.perms, 'VIEW_CHANNEL'));
  const reads = await HubReadState.find({ user: actor.id, target: { $in: visible.map((v) => v.channel._id) } }).lean();
  const readMap = new Map(reads.map((r) => [String(r.target), r.lastReadAt]));
  const canManage = hasPermission(perms, 'MANAGE_CHANNELS');

  return ok({
    server: { ...ctx.server, _id: String(ctx.server._id) },
    member: ctx.member ? { roles: ctx.member.roles.map(String), nickname: ctx.member.nickname, notify: ctx.member.notify, timedOutUntil: ctx.member.timedOutUntil } : null,
    permissions: perms,
    permissionNames: permissionNames(perms),
    isOwner: ctx.isOwner,
    roles: [...ctx.roles.values()].sort((a, b) => b.position - a.position).map((r) => ({ ...r, _id: String(r._id), server: undefined })),
    channels: visible.map(({ channel, perms: p }) => {
      const read = readMap.get(String(channel._id));
      return {
        _id: String(channel._id),
        name: channel.name,
        kind: channel.kind,
        topic: channel.topic,
        category: channel.category,
        position: channel.position,
        slowModeSeconds: channel.slowModeSeconds,
        lastMessageAt: channel.lastMessageAt,
        unread: Boolean(channel.lastMessageAt && (!read || read < channel.lastMessageAt)),
        canSend: hasPermission(p, 'SEND_MESSAGES'),
        overwrites: canManage ? channel.overwrites.map((o) => ({ ...o, target: String(o.target) })) : undefined,
        discord: canManage && channel.discord?.direction
          ? { direction: channel.discord.direction, channelId: channel.discord.channelId, hasWebhook: Boolean(channel.discord.webhookUrl) }
          : undefined,
      };
    }),
    discordBotInviteUrl: hasPermission(perms, 'MANAGE_SERVER') ? botInviteUrl() : null,
  });
});

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
