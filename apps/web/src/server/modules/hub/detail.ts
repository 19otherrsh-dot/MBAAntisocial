import { hasPermission, permissionNames } from '@mba/shared/hub';
import HubChannel from '@/models/hub/HubChannel';
import HubReadState from '@/models/hub/HubReadState';
import { channelPerms, requireServer } from './access';
import { botInviteUrl } from './discord';

/**
 * A server with the channels the caller can see, unread state, roles, and their
 * permissions. Served by GET /api/hub/servers/[id], and rendered into the hub's
 * first paint by the hub pages.
 */
export async function serverDetail(actorId: string, serverId: string) {
  const { ctx, perms } = await requireServer(actorId, serverId);
  const channels = await HubChannel.find({ server: ctx.server._id, archivedAt: { $exists: false } }).select('+discord.webhookUrl').sort({ position: 1 }).lean();
  const visible = channels
    .map((c) => ({ channel: c, perms: channelPerms(ctx, c) }))
    .filter((c) => hasPermission(c.perms, 'VIEW_CHANNEL'));
  const reads = await HubReadState.find({ user: actorId, target: { $in: visible.map((v) => v.channel._id) } }).lean();
  const readMap = new Map(reads.map((r) => [String(r.target), r.lastReadAt]));
  const canManage = hasPermission(perms, 'MANAGE_CHANNELS');

  return {
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
  };
}
