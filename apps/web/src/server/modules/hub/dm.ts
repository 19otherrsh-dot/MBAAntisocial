import type { Types } from 'mongoose';
import { parseMentions } from '@mba/shared/hub';
import { topics } from '@mba/shared/realtime';
import { ApiError } from '@/lib/api/errors';
import { checkConnection } from '@/lib/connections';
import { notify } from '@/lib/notifications';
import HubConversation from '@/models/hub/HubConversation';
import HubMessage, { type HubAttachment } from '@/models/hub/HubMessage';
import HubReadState from '@/models/hub/HubReadState';
import User from '@/models/User';
import { container } from '../../container';
import { serialiseMessage } from './messages';

const PEOPLE = 'name image role year';
const MAX_GROUP = 10;

/**
 * Direct messages. Still gated by `lib/connections`: a DM unlocks only once
 * something real happened between two people (a session, a reply, an opt-in
 * post). A group DM needs the creator to be connected to every member.
 */
export async function startConversation(actor: { id: string; role: string; campus: string }, peerIds: string[], name = '') {
  const others = [...new Set(peerIds.filter((id) => id !== actor.id))];
  if (others.length === 0) throw ApiError.badRequest('Pick at least one person.');
  if (others.length + 1 > MAX_GROUP) throw ApiError.unprocessable(`Group DMs hold up to ${MAX_GROUP} people.`);

  for (const peer of others) {
    const check = await checkConnection(actor.id, actor.role, peer);
    if (!check.allowed) {
      throw ApiError.forbidden(
        'You can message someone after a session together, when they message you first, or when they posted something inviting contact.'
      );
    }
  }

  const participants = [actor.id, ...others].sort();
  const kind = participants.length === 2 ? 'dm' : 'group';
  const key = participants.join(':');
  if (kind === 'dm') {
    const existing = await HubConversation.findOne({ key, kind: 'dm' });
    if (existing) return existing;
  }
  try {
    return await HubConversation.create({ campus: actor.campus, participants, key, kind, name: kind === 'group' ? name : '', createdBy: actor.id });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return (await HubConversation.findOne({ key, kind: 'dm' }))!;
    throw error;
  }
}

export async function listConversations(userId: string) {
  const conversations = await HubConversation.find({ participants: userId }).sort({ lastMessageAt: -1, createdAt: -1 }).limit(100).populate('participants', PEOPLE).lean();
  const reads = await HubReadState.find({ user: userId, target: { $in: conversations.map((c) => c._id) } }).lean();
  const readMap = new Map(reads.map((r) => [String(r.target), r.lastReadAt]));
  return conversations.map((c) => ({
    _id: String(c._id),
    kind: c.kind,
    name: c.name,
    participants: (c.participants as unknown as Array<{ _id: Types.ObjectId; name: string; image?: string }>).filter((p) => String(p._id) !== userId),
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    unread: Boolean(c.lastMessageAt && (!readMap.get(String(c._id)) || readMap.get(String(c._id))! < c.lastMessageAt)),
  }));
}

export async function requireConversation(userId: string, conversationId: string) {
  if (!/^[a-f0-9]{24}$/.test(conversationId)) throw ApiError.notFound('That conversation does not exist.');
  const conversation = await HubConversation.findOne({ _id: conversationId, participants: userId }).populate('participants', PEOPLE).lean();
  if (!conversation) throw ApiError.notFound('That conversation does not exist.');
  return conversation;
}

export async function listDirectMessages(userId: string, conversationId: string, before?: Date, limit = 50) {
  await requireConversation(userId, conversationId);
  const filter: Record<string, unknown> = { conversation: conversationId };
  if (before) filter.createdAt = { $lt: before };
  const rows = await HubMessage.find(filter).sort({ createdAt: -1 }).limit(limit).populate('author', PEOPLE).lean();
  return rows.reverse().map((m) => serialiseMessage(m as never, userId));
}

/** Notify at most once per conversation per ten minutes, so a chat is not a siren. */
const DM_NOTIFY_THROTTLE_SECONDS = 600;

export async function postDirectMessage(authorId: string, conversationId: string, content: string, attachments: HubAttachment[]) {
  const conversation = await requireConversation(authorId, conversationId);
  if (!content.trim() && attachments.length === 0) throw ApiError.badRequest('Say something, or attach a file.');
  const { storage, realtime, kv } = container();
  if (attachments.some((a) => !storage.isOwnUrl(a.url))) throw ApiError.badRequest('Attach files by uploading them here.');

  const message = await HubMessage.create({
    conversation: conversationId,
    author: authorId,
    content: content.trim(),
    attachments,
    mentions: { users: parseMentions(content).users, roles: [], everyone: false },
  });
  const now = new Date();
  await HubConversation.updateOne({ _id: conversationId }, { $set: { lastMessageAt: now, lastMessagePreview: content.trim().slice(0, 140) || '📎 Attachment' } });
  await HubReadState.updateOne({ user: authorId, target: conversationId }, { $set: { lastReadAt: now, targetKind: 'conversation' } }, { upsert: true });

  const populated = await HubMessage.findById(message._id).populate('author', PEOPLE).lean();
  const payload = serialiseMessage(populated as never, authorId);
  const participantIds = (conversation.participants as unknown as Array<{ _id: Types.ObjectId }>).map((p) => String(p._id));

  await realtime.publish(topics.dm(conversationId), 'dm.message.created', { conversationId, message: payload });
  // Each participant's own topic too, so DM lists update without subscribing to every conversation.
  await Promise.all(participantIds.map((id) => realtime.publish(topics.user(id), 'dm.message.created', { conversationId, message: payload })));

  const author = await User.findById(authorId).select('name').lean();
  for (const id of participantIds) {
    if (id === authorId) continue;
    if (!(await kv.setIfAbsent(`dm-notify:${id}:${conversationId}`, '1', DM_NOTIFY_THROTTLE_SECONDS))) continue;
    await notify({
      user: id,
      kind: 'dm_message',
      title: `${author?.name ?? 'Someone'} sent you a message`,
      body: content.slice(0, 140),
      href: `/hub/dm/${conversationId}`,
      entityType: 'conversation',
      entity: conversationId,
      actor: authorId,
    });
  }
  return payload;
}
