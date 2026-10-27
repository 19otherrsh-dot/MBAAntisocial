import { route, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import HubChannel from '@/models/hub/HubChannel';
import { requireServer } from '@/server/modules/hub/access';
import { channelSchema } from '@/server/modules/hub/schemas';
import { normaliseChannelName } from '@/server/modules/hub/service';

export const POST = route({ body: channelSchema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const { ctx } = await requireServer(actor.id, params.id, 'MANAGE_CHANNELS');
  const name = normaliseChannelName(body.name);
  if (!name) throw ApiError.unprocessable('Pick a channel name with letters or numbers.');
  const count = await HubChannel.countDocuments({ server: ctx.server._id, archivedAt: { $exists: false } });
  if (count >= 100) throw ApiError.unprocessable('A server can have up to 100 channels.');
  const channel = await HubChannel.create({ ...body, name, server: ctx.server._id, position: count });
  return created({ channel: { ...channel.toObject(), _id: String(channel._id) } });
});
