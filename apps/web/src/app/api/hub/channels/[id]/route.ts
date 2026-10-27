import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { topics } from '@mba/shared/realtime';
import HubChannel from '@/models/hub/HubChannel';
import { requireChannel } from '@/server/modules/hub/access';
import { updateChannelSchema } from '@/server/modules/hub/schemas';
import { normaliseChannelName } from '@/server/modules/hub/service';
import { container } from '@/server/container';

export const PATCH = route({ body: updateChannelSchema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const { channel, ctx } = await requireChannel(actor.id, params.id, 'MANAGE_CHANNELS');
  const update: Record<string, unknown> = { ...body };
  if (body.name !== undefined) {
    const name = normaliseChannelName(body.name);
    if (!name) throw ApiError.unprocessable('Pick a channel name with letters or numbers.');
    update.name = name;
  }
  if (body.kind && body.kind !== channel.kind) throw ApiError.badRequest('A channel’s type cannot change; create a new one.');
  await HubChannel.updateOne({ _id: channel._id }, { $set: update });
  const fresh = await HubChannel.findById(channel._id).lean();
  await container().realtime.publish(topics.hubServer(String(ctx.server._id)), 'hub.channel.updated', { serverId: String(ctx.server._id), channel: { ...fresh, _id: String(channel._id) } });
  return ok({ updated: true });
});

export const DELETE = route({ rateLimit: 'write', feature: 'hub' }, async ({ actor, params }) => {
  const { channel, ctx } = await requireChannel(actor.id, params.id, 'MANAGE_CHANNELS');
  const remaining = await HubChannel.countDocuments({ server: ctx.server._id, kind: { $ne: 'voice' }, archivedAt: { $exists: false } });
  if (remaining <= 1 && channel.kind !== 'voice') throw ApiError.badRequest('A server needs at least one text channel.');
  await HubChannel.updateOne({ _id: channel._id }, { $set: { archivedAt: new Date() } });
  await container().realtime.publish(topics.hubServer(String(ctx.server._id)), 'hub.channel.deleted', { serverId: String(ctx.server._id), channelId: String(channel._id) });
  return ok({ deleted: true });
});
