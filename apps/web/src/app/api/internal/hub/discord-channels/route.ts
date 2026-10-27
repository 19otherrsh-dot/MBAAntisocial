import { internalRoute, ok } from '@/lib/api/handler';
import HubChannel from '@/models/hub/HubChannel';

/** Discord channel ids bridged inbound, so the bot ignores everything else. */
export const POST = internalRoute({}, async () => {
  const ids = await HubChannel.distinct('discord.channelId', { 'discord.direction': { $in: ['in', 'both'] }, archivedAt: { $exists: false } });
  return ok({ channelIds: ids.filter(Boolean) });
});
