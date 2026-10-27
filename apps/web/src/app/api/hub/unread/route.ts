import { route, ok } from '@/lib/api/handler';
import HubMember from '@/models/hub/HubMember';
import HubChannel from '@/models/hub/HubChannel';
import HubReadState from '@/models/hub/HubReadState';
import HubMessage from '@/models/hub/HubMessage';
import HubConversation from '@/models/hub/HubConversation';

/**
 * Unread summary for the server rail and the DM button: which servers have
 * unread channels, mention counts per server, and unread DMs.
 */
export const GET = route({ feature: 'hub' }, async ({ actor }) => {
  const memberships = await HubMember.find({ user: actor.id }).select('server notify').lean();
  const serverIds = memberships.map((m) => m.server);
  const [channels, conversations] = await Promise.all([
    HubChannel.find({ server: { $in: serverIds }, archivedAt: { $exists: false }, kind: { $ne: 'voice' }, lastMessageAt: { $exists: true } }).select('server lastMessageAt').lean(),
    HubConversation.find({ participants: actor.id, lastMessageAt: { $exists: true } }).select('lastMessageAt').lean(),
  ]);
  const reads = await HubReadState.find({ user: actor.id, target: { $in: [...channels.map((c) => c._id), ...conversations.map((c) => c._id)] } }).lean();
  const readMap = new Map(reads.map((r) => [String(r.target), r.lastReadAt]));

  const servers: Record<string, { unread: boolean; mentions: number }> = {};
  const unreadChannelIds = [];
  for (const channel of channels) {
    const read = readMap.get(String(channel._id));
    if (!read || read < channel.lastMessageAt!) {
      servers[String(channel.server)] = { unread: true, mentions: 0 };
      unreadChannelIds.push(channel._id);
    }
  }

  // Mentions since last read, counted per server (bounded).
  if (unreadChannelIds.length) {
    const oldest = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const mentions = await HubMessage.find({ channel: { $in: unreadChannelIds }, 'mentions.users': actor.id, createdAt: { $gte: oldest }, deletedAt: { $exists: false } })
      .select('channel server createdAt')
      .limit(500)
      .lean();
    for (const m of mentions) {
      const read = readMap.get(String(m.channel));
      if (read && read >= m.createdAt) continue;
      const key = String(m.server);
      servers[key] = { unread: true, mentions: (servers[key]?.mentions ?? 0) + 1 };
    }
  }

  const unreadDms = conversations.filter((c) => {
    const read = readMap.get(String(c._id));
    return !read || read < c.lastMessageAt!;
  }).length;

  return ok({ servers, unreadDms });
});
