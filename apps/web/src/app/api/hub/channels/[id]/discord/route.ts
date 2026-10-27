import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { requireChannel } from '@/server/modules/hub/access';
import { discordBridgeSchema } from '@/server/modules/hub/schemas';
import { configureBridge, isDiscordWebhook } from '@/server/modules/hub/discord';

/**
 * Bridges a channel to Discord. Outbound needs a Discord webhook URL (made in
 * the Discord channel's integrations settings); inbound needs the bot in the
 * guild and the Discord channel id.
 */
export const PUT = route({ body: discordBridgeSchema, rateLimit: 'write', feature: 'hub' }, async ({ actor, params, body }) => {
  const { channel } = await requireChannel(actor.id, params.id, 'MANAGE_CHANNELS');
  if (channel.kind === 'voice') throw ApiError.badRequest('Voice channels cannot be bridged.');
  if (body.webhookUrl && !isDiscordWebhook(body.webhookUrl)) throw ApiError.unprocessable('That is not a Discord webhook URL.', { webhookUrl: 'Paste the webhook URL from Discord → Channel settings → Integrations.' });
  if ((body.direction === 'out' || body.direction === 'both') && !body.webhookUrl && !channel.discord?.direction) {
    throw ApiError.unprocessable('Outbound mirroring needs a webhook URL.', { webhookUrl: 'Required for outbound.' });
  }
  if ((body.direction === 'in' || body.direction === 'both') && !body.discordChannelId) {
    throw ApiError.unprocessable('Inbound needs the Discord channel id.', { discordChannelId: 'Right-click the Discord channel → Copy Channel ID.' });
  }
  await configureBridge(String(channel._id), body);
  return ok({ bridged: true });
});

export const DELETE = route({ rateLimit: 'write', feature: 'hub' }, async ({ actor, params }) => {
  const { channel } = await requireChannel(actor.id, params.id, 'MANAGE_CHANNELS');
  await configureBridge(String(channel._id), null);
  return ok({ bridged: false });
});
