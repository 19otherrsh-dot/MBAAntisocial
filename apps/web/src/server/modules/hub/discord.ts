import type { Types } from 'mongoose';
import { parseMentions } from '@mba/shared/hub';
import { topics } from '@mba/shared/realtime';
import { env } from '@/lib/env';
import HubChannel from '@/models/hub/HubChannel';
import HubMessage, { type IHubMessage } from '@/models/hub/HubMessage';
import ExternalAccount from '@/models/ExternalAccount';
import User from '@/models/User';
import { container } from '../../container';
import { decrypt, encrypt } from '../../crypto';
import { serialiseMessage } from './messages';

/**
 * The Discord bridge. Outbound uses a channel webhook — no bot needed — and
 * posts under each author's own name. Inbound needs the bot (run by the
 * realtime service's gateway client), which relays messages here.
 *
 * Bridged messages are tagged on both sides so nothing ever loops.
 */

/** Permissions the bot asks for: view channels, send, read history, manage webhooks. */
const BOT_PERMISSIONS = 1024 + 2048 + 65536 + 536870912;

export function botInviteUrl(): string | null {
  if (!env.DISCORD_CLIENT_ID) return null;
  const params = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, scope: 'bot', permissions: String(BOT_PERMISSIONS) });
  return `https://discord.com/oauth2/authorize?${params}`;
}

const WEBHOOK_PATTERN = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isDiscordWebhook(url: string): boolean {
  return WEBHOOK_PATTERN.test(url);
}

export async function configureBridge(
  channelId: string,
  config: { webhookUrl?: string; discordChannelId?: string; direction: 'out' | 'in' | 'both' } | null
) {
  if (!config) {
    await HubChannel.updateOne({ _id: channelId }, { $unset: { discord: 1 } });
    return;
  }
  const update: Record<string, unknown> = {
    'discord.direction': config.direction,
    'discord.channelId': config.discordChannelId ?? '',
  };
  if (config.webhookUrl) update['discord.webhookUrl'] = encrypt(config.webhookUrl);
  await HubChannel.updateOne({ _id: channelId }, { $set: update });
}

async function readableContent(message: IHubMessage): Promise<string> {
  const parsed = parseMentions(message.content);
  if (parsed.users.length === 0) return message.content;
  const users = await User.find({ _id: { $in: parsed.users } }).select('name').lean();
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return message.content.replace(/<@([a-f0-9]{24})>/g, (_, id) => `@${names.get(id) ?? 'member'}`).replace(/<@&[a-f0-9]{24}>/g, '@role');
}

export async function mirrorOutbound(channelId: string, message: IHubMessage & { _id: Types.ObjectId }) {
  const channel = await HubChannel.findById(channelId).select('+discord.webhookUrl discord').lean();
  const bridge = channel?.discord;
  if (!bridge?.webhookUrl || (bridge.direction !== 'out' && bridge.direction !== 'both')) return;
  if (message.system || message.thread) return;

  const author = message.author as unknown as { name?: string; image?: string } | undefined;
  const content = (await readableContent(message)).slice(0, 1900);
  const attachments = message.attachments.map((a) => a.url).join('\n');
  const body = [content, attachments].filter(Boolean).join('\n');
  if (!body) return;

  const res = await fetch(`${decrypt(bridge.webhookUrl)}?wait=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: body,
      username: `${author?.name ?? 'MBAAntisocial'} · MBAAntisocial`.slice(0, 80),
      avatar_url: author?.image && author.image.startsWith('https://') ? author.image : undefined,
      // Never let a hub message ping @everyone or roles on the Discord side.
      allowed_mentions: { parse: [] },
    }),
  });
  if (!res.ok) console.error(`[discord] webhook returned ${res.status} for channel ${channelId}`);
}

export interface InboundDiscordMessage {
  discordChannelId: string;
  messageId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  attachments: Array<{ url: string; name: string; contentType?: string; size?: number }>;
}

/**
 * A message from a bridged Discord channel. Posted into every hub channel
 * bridged inbound to it, attributed to the linked platform user when the
 * Discord account is linked, otherwise shown with the Discord name.
 */
export async function receiveInbound(input: InboundDiscordMessage) {
  const channels = await HubChannel.find({ 'discord.channelId': input.discordChannelId, 'discord.direction': { $in: ['in', 'both'] }, archivedAt: { $exists: false } }).lean();
  if (channels.length === 0) return { delivered: 0 };

  const linked = await ExternalAccount.findOne({ provider: 'discord', accountId: input.authorId }).select('user').lean();
  let delivered = 0;
  for (const channel of channels) {
    if (await HubMessage.exists({ channel: channel._id, 'viaDiscord.messageId': input.messageId })) continue;
    const message = await HubMessage.create({
      channel: channel._id,
      server: channel.server,
      author: linked?.user,
      content: input.content.slice(0, 4000),
      // Discord CDN links, shown as links; we do not re-host them.
      attachments: input.attachments.slice(0, 6).map((a) => ({ url: a.url, name: a.name, mime: a.contentType ?? '', bytes: a.size ?? 0 })),
      viaDiscord: { authorName: input.authorName, authorAvatar: input.authorAvatar, messageId: input.messageId },
    });
    await HubChannel.updateOne({ _id: channel._id }, { $set: { lastMessageAt: new Date() } });
    const populated = await HubMessage.findById(message._id).populate('author', 'name image role year').lean();
    await container().realtime.publish(topics.hubChannel(String(channel._id)), 'hub.message.created', {
      channelId: String(channel._id),
      message: serialiseMessage(populated as never, ''),
    });
    delivered += 1;
  }
  return { delivered };
}
