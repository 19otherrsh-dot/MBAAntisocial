import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import { assertCanMessage } from '@/lib/connections';
import Message from '@/models/Message';
import User from '@/models/User';
import { publish } from '@/lib/pusherServer';
import { userChannel } from '@/lib/realtime';

/**
 * Direct messages, gated by `lib/connections.ts`.
 *
 * The previous implementation had no gate at all: any signed-in user could
 * message any user id, including across campuses, with no prior relationship.
 * That is precisely the unstructured cold-DM behaviour the scheduling module
 * was built to replace, and it bypassed the booking cap protecting seniors.
 */

const querySchema = z.object({
  peerId: objectId.optional(),
});

const sendSchema = z.object({
  receiverId: objectId,
  content: z.string().trim().min(1, 'Write something first.').max(2000, 'That is too long.'),
});

/** A message with both parties populated, as the conversation list reads them. */
interface PopulatedMessage {
  _id: unknown;
  content: string;
  createdAt: Date;
  read?: boolean;
  sender: { _id: { toString(): string }; name: string; image?: string };
  receiver: { _id: { toString(): string }; name: string; image?: string };
}

export const GET = route({ query: querySchema }, async ({ actor, query }) => {
  if (!query.peerId) {
    const messages = await Message.find({
      $or: [{ sender: actor.id }, { receiver: actor.id }],
    })
      .sort({ createdAt: -1 })
      .limit(300)
      .populate('sender', 'name image')
      .populate('receiver', 'name image')
      .lean();

    // Collapse to one row per counterpart, newest first.
    const peers = new Map<string, unknown>();
    for (const msg of messages as unknown as PopulatedMessage[]) {
      const isSender = msg.sender._id.toString() === actor.id;
      const peer = isSender ? msg.receiver : msg.sender;
      const key = peer._id.toString();
      const unread = !isSender && !msg.read;
      const existing = peers.get(key) as { unreadCount: number } | undefined;
      if (existing) {
        if (unread) existing.unreadCount += 1;
        continue;
      }

      peers.set(key, {
        user: peer,
        lastMessage: msg.content,
        time: msg.createdAt,
        unread,
        unreadCount: unread ? 1 : 0,
      });
    }

    return ok({ conversations: Array.from(peers.values()) });
  }

  // Reading a thread requires the same standing as writing one — otherwise the
  // gate only stops people sending, not looking.
  const reason = await assertCanMessage(actor.id, actor.role, query.peerId);

  const [peer, thread] = await Promise.all([
    User.findById(query.peerId).select('name image year role').lean(),
    Message.find({
      $or: [
        { sender: actor.id, receiver: query.peerId },
        { sender: query.peerId, receiver: actor.id },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  ]);
  if (!peer) throw ApiError.notFound('That person could not be found.');

  await Message.updateMany(
    { sender: query.peerId, receiver: actor.id, read: false },
    { $set: { read: true } }
  );

  /*
   * The peer comes back with the thread so a conversation can be opened before
   * its first message exists. Without it the page could only render threads
   * already in the list, which made it impossible to start one at all.
   */
  return ok({
    peer: { _id: String(peer._id), name: peer.name, image: peer.image ?? '', year: peer.year, role: peer.role },
    reason,
    // Newest 200, returned oldest-first for display.
    messages: thread.reverse().map((message) => ({
      _id: String(message._id),
      sender: String(message.sender),
      receiver: String(message.receiver),
      content: message.content,
      createdAt: message.createdAt,
    })),
  });
});

export const POST = route({ body: sendSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  if (body.receiverId === actor.id) {
    throw ApiError.badRequest('You cannot message yourself.');
  }

  await assertCanMessage(actor.id, actor.role, body.receiverId);

  const message = await Message.create({
    sender: actor.id,
    receiver: body.receiverId,
    content: body.content,
  });

  const populated = {
    _id: String(message._id),
    sender: actor.id,
    senderName: actor.name,
    receiver: body.receiverId,
    content: message.content,
    createdAt: message.createdAt,
  };

  // Realtime delivery is a nicety; the message is already stored and will
  // appear on the recipient's next load regardless.
  await publish(userChannel(body.receiverId), 'new-message', populated);

  return created(populated);
});
