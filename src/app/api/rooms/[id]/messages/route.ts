import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import type { Actor } from '@/lib/api/handler';
import StudyRoom from '@/models/StudyRoom';
import RoomMessage from '@/models/RoomMessage';
import { objectId, roomMessageSchema } from '@/lib/validation';
import { publish } from '@/lib/pusherServer';
import { roomChannel } from '@/lib/realtime';

const AUTHOR_FIELDS = 'name image badges';
const HISTORY_LIMIT = 200;

/**
 * Loads a room the caller may use, or reports it as missing.
 *
 * A room is open to its own campus, or to everyone when its creator marked it
 * global — that flag is the one deliberate cross-campus surface, chosen per
 * room by the person opening it. There is no role that bypasses the check, and
 * a room past its expiry is gone even if the TTL sweep has not removed it yet.
 * "Not found" rather than "forbidden", so ids cannot be probed.
 */
async function loadRoom(id: string, actor: Actor) {
  const room = await StudyRoom.findOne({ _id: id, expiresAt: { $gt: new Date() } })
    .populate('createdBy', AUTHOR_FIELDS)
    .lean();
  if (!room || (!room.isGlobal && room.campus !== actor.campus)) {
    throw ApiError.notFound('That room has closed or does not exist.');
  }
  return room;
}

export const GET = route({}, async ({ params, actor }) => {
  const id = objectId.parse(params.id);
  const room = await loadRoom(id, actor);

  // The newest page, returned oldest-first. A busy room is not sent whole.
  const messages = await RoomMessage.find({ room: id })
    .sort({ createdAt: -1 })
    .limit(HISTORY_LIMIT)
    .populate('author', AUTHOR_FIELDS)
    .lean();

  return ok({ room, messages: messages.reverse() });
});

export const POST = route(
  // Rate limited: a live room with no throttle is a flood waiting to happen,
  // and every message fans out over a socket to everyone in it.
  { body: roomMessageSchema, rateLimit: 'chat' },
  async ({ params, body, actor }) => {
    const id = objectId.parse(params.id);
    const room = await loadRoom(id, actor);

    const message = await RoomMessage.create({
      room: id,
      author: actor.id,
      content: body.content,
      // Messages expire with their room rather than outliving it as orphans.
      expiresAt: room.expiresAt,
    });

    const populated = await message.populate('author', AUTHOR_FIELDS);
    const payload = populated.toJSON();

    await publish(roomChannel(id), 'new-message', payload);

    return created(payload);
  }
);
