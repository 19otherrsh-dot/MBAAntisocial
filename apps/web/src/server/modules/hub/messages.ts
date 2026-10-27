import type { Types } from 'mongoose';
import { hasPermission, parseMentions, MAX_ATTACHMENTS_PER_MESSAGE } from '@mba/shared/hub';
import { topics } from '@mba/shared/realtime';
import { ApiError } from '@/lib/api/errors';
import { notifyMany } from '@/lib/notifications';
import HubMessage, { type HubAttachment, type IHubMessage } from '@/models/hub/HubMessage';
import HubChannel from '@/models/hub/HubChannel';
import HubMember from '@/models/hub/HubMember';
import HubReadState from '@/models/hub/HubReadState';
import User from '@/models/User';
import { container } from '../../container';
import { channelPerms, type ChannelContext } from './access';

const AUTHOR_FIELDS = 'name image role year';
const MAX_DISTINCT_REACTIONS = 20;
const MAX_MENTION_NOTIFICATIONS = 300;

type LeanMessage = IHubMessage & { _id: Types.ObjectId };

/** A message as clients see it: reactions summarised, deleted/hidden content withheld. */
export function serialiseMessage(message: LeanMessage, viewerId: string, canModerate = false) {
  const removed = Boolean(message.deletedAt);
  const hidden = Boolean(message.hiddenAt) && !canModerate;
  return {
    _id: String(message._id),
    channel: message.channel ? String(message.channel) : undefined,
    conversation: message.conversation ? String(message.conversation) : undefined,
    author: message.author,
    content: removed ? '' : hidden ? '' : message.content,
    attachments: removed || hidden ? [] : message.attachments,
    mentions: {
      users: (message.mentions?.users ?? []).map(String),
      roles: (message.mentions?.roles ?? []).map(String),
      everyone: Boolean(message.mentions?.everyone),
    },
    replyTo: message.replyTo ? String(message.replyTo) : undefined,
    thread: message.thread ? String(message.thread) : undefined,
    threadCount: message.threadCount ?? 0,
    lastThreadAt: message.lastThreadAt,
    title: message.title ?? '',
    reactions: (message.reactions ?? []).map((r) => ({
      emoji: r.emoji,
      count: r.users.length,
      mine: r.users.some((u) => String(u) === viewerId),
    })),
    pinned: Boolean(message.pinnedAt),
    edited: Boolean(message.editedAt),
    deleted: removed,
    hidden: Boolean(message.hiddenAt),
    system: message.system,
    viaDiscord: message.viaDiscord?.authorName ? message.viaDiscord : undefined,
    markedUseful: message.markedUseful,
    createdAt: message.createdAt,
  };
}

export type SerialisedMessage = ReturnType<typeof serialiseMessage>;

export async function listChannelMessages(
  access: ChannelContext,
  viewerId: string,
  options: { before?: Date; thread?: string; limit: number; pinned?: boolean }
) {
  const filter: Record<string, unknown> = { channel: access.channel._id };
  if (options.thread) {
    filter.$or = [{ _id: options.thread }, { thread: options.thread }];
  } else {
    filter.thread = { $exists: false };
  }
  if (options.pinned) filter.pinnedAt = { $exists: true };
  if (options.before) filter.createdAt = { $lt: options.before };

  const canModerate = hasPermission(access.perms, 'MANAGE_MESSAGES');
  const rows = await HubMessage.find(filter)
    .sort({ createdAt: options.thread ? 1 : -1 })
    .limit(options.limit)
    .populate('author', AUTHOR_FIELDS)
    .lean();
  const ordered = options.thread ? rows : rows.reverse();
  return ordered.map((m) => serialiseMessage(m as LeanMessage, viewerId, canModerate));
}

export interface PostInput {
  content: string;
  attachments: HubAttachment[];
  replyTo?: string;
  thread?: string;
  title?: string;
}

/**
 * Posts into a channel after every gate: send permission (thread replies
 * included), attachments, slow mode, @everyone, forum titles. Then fans out:
 * realtime to the channel, an activity ping to the server, mention
 * notifications, and the Discord mirror.
 */
export async function postChannelMessage(access: ChannelContext, authorId: string, input: PostInput) {
  const { channel, ctx, perms } = access;
  if (channel.kind === 'voice') throw ApiError.badRequest('Voice channels do not have a text chat.');
  if (!hasPermission(perms, 'SEND_MESSAGES')) throw ApiError.forbidden('You can read this channel but not post in it.');
  if (input.attachments.length > 0 && !hasPermission(perms, 'ATTACH_FILES')) throw ApiError.forbidden('Attachments are turned off for you here.');
  if (input.attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) throw ApiError.unprocessable(`Up to ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`);
  if (!input.content.trim() && input.attachments.length === 0) throw ApiError.badRequest('Say something, or attach a file.');

  const { storage, kv, realtime } = container();
  if (input.attachments.some((a) => !storage.isOwnUrl(a.url))) throw ApiError.badRequest('Attach files by uploading them here.');

  let threadRoot: LeanMessage | null = null;
  if (input.thread) {
    threadRoot = (await HubMessage.findOne({ _id: input.thread, channel: channel._id, thread: { $exists: false } }).lean()) as LeanMessage | null;
    if (!threadRoot) throw ApiError.notFound('That thread no longer exists.');
  } else if (channel.kind === 'forum') {
    if (!hasPermission(perms, 'CREATE_THREADS')) throw ApiError.forbidden('You cannot start posts here.');
    if (!input.title?.trim()) throw ApiError.unprocessable('Forum posts need a title.', { title: 'Give your post a title.' });
  }

  // Slow mode, skipped for anyone who can manage messages.
  if (channel.slowModeSeconds > 0 && !hasPermission(perms, 'MANAGE_MESSAGES')) {
    const fresh = await kv.setIfAbsent(`slowmode:${channel._id}:${authorId}`, '1', channel.slowModeSeconds);
    if (!fresh) throw ApiError.tooManyRequests(`Slow mode is on: one message every ${channel.slowModeSeconds}s.`, channel.slowModeSeconds);
  }

  const parsed = parseMentions(input.content);
  const everyone = parsed.everyone && hasPermission(perms, 'MENTION_EVERYONE');
  const validRoleIds = parsed.roles.filter((id) => ctx.roles.has(id) && (ctx.roles.get(id)!.mentionable || hasPermission(perms, 'MENTION_EVERYONE')));

  const message = await HubMessage.create({
    channel: channel._id,
    server: ctx.server._id,
    author: authorId,
    content: input.content.trim(),
    attachments: input.attachments,
    mentions: { users: parsed.users, roles: validRoleIds, everyone },
    replyTo: input.replyTo,
    thread: threadRoot?._id,
    title: !threadRoot && channel.kind === 'forum' ? input.title?.trim() ?? '' : '',
  });

  const now = new Date();
  await HubChannel.updateOne({ _id: channel._id }, { $set: { lastMessageAt: now } });
  if (threadRoot) await HubMessage.updateOne({ _id: threadRoot._id }, { $inc: { threadCount: 1 }, $set: { lastThreadAt: now } });
  // Posting counts as reading.
  await HubReadState.updateOne(
    { user: authorId, target: channel._id },
    { $set: { lastReadAt: now, targetKind: 'channel' } },
    { upsert: true }
  );

  const populated = (await HubMessage.findById(message._id).populate('author', AUTHOR_FIELDS).lean()) as LeanMessage;
  const payload = serialiseMessage(populated, authorId);

  await realtime.publish(topics.hubChannel(String(channel._id)), 'hub.message.created', { channelId: String(channel._id), message: payload });

  const mentionedUserIds = await resolveMentionRecipients(access, authorId, parsed.users, validRoleIds, everyone);
  await realtime.publish(topics.hubServer(String(ctx.server._id)), 'hub.activity', {
    serverId: String(ctx.server._id),
    channelId: String(channel._id),
    messageId: String(message._id),
    authorId,
    mentions: mentionedUserIds.slice(0, 200),
    at: now.toISOString(),
  });

  if (mentionedUserIds.length > 0) {
    const author = await User.findById(authorId).select('name').lean();
    await notifyMany(
      mentionedUserIds.slice(0, MAX_MENTION_NOTIFICATIONS).map((user) => ({
        user,
        kind: 'mention' as const,
        title: `${author?.name ?? 'Someone'} mentioned you in #${channel.name}`,
        body: input.content.replace(/<@&?[a-f0-9]{24}>/g, '@…').slice(0, 140),
        href: `/hub/${ctx.server._id}/${channel._id}${threadRoot ? `?thread=${threadRoot._id}` : ''}`,
        entityType: 'hub_message',
        entity: message._id,
        actor: authorId,
      }))
    );
  }

  void mirrorToDiscord(String(channel._id), populated).catch((error) => console.error('[discord] mirror failed:', error));
  return payload;
}

/**
 * Who a message's mentions reach: named users, members of mentioned roles, or
 * everyone — but only people who can see the channel and have not muted the
 * server. A mention never notifies someone it cannot be shown to.
 */
async function resolveMentionRecipients(
  access: ChannelContext,
  authorId: string,
  userIds: string[],
  roleIds: string[],
  everyone: boolean
): Promise<string[]> {
  if (userIds.length === 0 && roleIds.length === 0 && !everyone) return [];
  const filter: Record<string, unknown> = { server: access.ctx.server._id, notify: { $ne: 'none' } };
  if (!everyone) filter.$or = [{ user: { $in: userIds } }, { roles: { $in: roleIds } }];
  const members = await HubMember.find(filter).select('user roles timedOutUntil').limit(2000).lean();

  const recipients: string[] = [];
  for (const member of members) {
    const id = String(member.user);
    if (id === authorId) continue;
    // Re-derive that this member can view the channel (overwrites may hide it).
    const memberCtx = {
      ...access.ctx,
      member: member as never,
      userId: id,
      isOwner: String(access.ctx.server.owner ?? '') === id,
      isCampusModerator: false,
      memberRoles: member.roles
        .map((r) => access.ctx.roles.get(String(r)))
        .filter(Boolean)
        .map((r) => ({ id: String(r!._id), permissions: r!.permissions, position: r!.position })),
    };
    if (hasPermission(channelPerms(memberCtx, access.channel), 'VIEW_CHANNEL')) recipients.push(id);
  }
  return recipients;
}

async function mirrorToDiscord(channelId: string, message: LeanMessage) {
  if (message.viaDiscord?.authorName) return; // Never echo Discord's own messages back.
  const { mirrorOutbound } = await import('./discord');
  await mirrorOutbound(channelId, message);
}

export async function editMessage(messageId: string, editorId: string, content: string) {
  const message = await HubMessage.findById(messageId);
  if (!message || message.deletedAt) throw ApiError.notFound('That message no longer exists.');
  if (String(message.author) !== editorId) throw ApiError.forbidden('You can only edit your own messages.');
  if (message.system || message.viaDiscord?.authorName) throw ApiError.badRequest('That message cannot be edited.');
  const parsed = parseMentions(content);
  message.content = content.trim();
  message.mentions.users = parsed.users as never;
  message.editedAt = new Date();
  await message.save();
  return publishUpdate(message._id);
}

export async function deleteMessage(messageId: string, actorId: string, canModerate: boolean) {
  const message = await HubMessage.findById(messageId);
  if (!message || message.deletedAt) throw ApiError.notFound('That message no longer exists.');
  const isAuthor = String(message.author) === actorId;
  if (!isAuthor && !canModerate) throw ApiError.forbidden('Only moderators can remove other people’s messages.');
  if (isAuthor) {
    message.deletedAt = new Date();
  } else {
    // Moderators hide rather than delete, so the call stays reviewable (as everywhere else).
    message.hiddenAt = new Date();
    message.hiddenBy = actorId as never;
  }
  await message.save();
  if (message.channel) {
    await container().realtime.publish(topics.hubChannel(String(message.channel)), 'hub.message.deleted', {
      channelId: String(message.channel),
      messageId: String(message._id),
    });
  }
  return { removed: true };
}

export async function toggleReaction(messageId: string, userId: string, emoji: string) {
  const message = await HubMessage.findById(messageId).select('reactions channel conversation deletedAt');
  if (!message || message.deletedAt) throw ApiError.notFound('That message no longer exists.');
  const existing = message.reactions.find((r) => r.emoji === emoji);
  if (existing) {
    const had = existing.users.some((u) => String(u) === userId);
    existing.users = had ? existing.users.filter((u) => String(u) !== userId) : [...existing.users, userId as never];
    message.reactions = message.reactions.filter((r) => r.users.length > 0);
  } else {
    if (message.reactions.length >= MAX_DISTINCT_REACTIONS) throw ApiError.unprocessable('That message has enough reactions.');
    message.reactions.push({ emoji, users: [userId as never] });
  }
  await message.save();
  const reactions = message.reactions.map((r) => ({ emoji: r.emoji, count: r.users.length, userIds: r.users.map(String) }));
  if (message.channel) {
    await container().realtime.publish(topics.hubChannel(String(message.channel)), 'hub.reaction', {
      channelId: String(message.channel),
      messageId,
      reactions,
    });
  } else if (message.conversation) {
    await container().realtime.publish(topics.dm(String(message.conversation)), 'hub.reaction', {
      channelId: String(message.conversation),
      messageId,
      reactions,
    });
  }
  return reactions;
}

export async function setPinned(messageId: string, pinned: boolean) {
  await HubMessage.updateOne({ _id: messageId }, pinned ? { $set: { pinnedAt: new Date() } } : { $unset: { pinnedAt: 1 } });
  return publishUpdate(messageId);
}

export async function markUseful(messageId: string, value: boolean) {
  await HubMessage.updateOne({ _id: messageId }, { $set: { markedUseful: value } });
  return publishUpdate(messageId);
}

async function publishUpdate(messageId: Types.ObjectId | string) {
  const message = (await HubMessage.findById(messageId).populate('author', AUTHOR_FIELDS).lean()) as LeanMessage | null;
  if (!message) throw ApiError.notFound();
  const payload = serialiseMessage(message, '');
  if (message.channel) {
    await container().realtime.publish(topics.hubChannel(String(message.channel)), 'hub.message.updated', {
      channelId: String(message.channel),
      message: payload,
    });
  }
  return payload;
}

export async function markRead(userId: string, targetId: string, kind: 'channel' | 'conversation') {
  await HubReadState.updateOne({ user: userId, target: targetId }, { $set: { lastReadAt: new Date(), targetKind: kind } }, { upsert: true });
}
