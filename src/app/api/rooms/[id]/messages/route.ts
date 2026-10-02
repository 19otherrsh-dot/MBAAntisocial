import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import StudyRoom from '@/models/StudyRoom';
import RoomMessage from '@/models/RoomMessage';
import { objectId, roomMessageSchema } from '@/lib/validation';
import { pusherServer } from '@/lib/pusherServer';

export const GET = route({}, async ({ params, actor }) => {
  const id = objectId.parse(params.id);
  const room = await StudyRoom.findById(id);
  if (!room) throw ApiError.notFound('Room not found');

  // Verify access based on campus and global scope
  if (!room.isGlobal && room.campus !== actor.campus && actor.role !== 'alumni') {
    throw ApiError.notFound('Room not found');
  }

  const messages = await RoomMessage.find({ room: id })
    .sort({ createdAt: 1 })
    .populate('author', 'name image badges')
    .lean();

  return ok({ room, messages });
});

export const POST = route(
  // Rate limited: a live room with no throttle is a flood waiting to happen,
  // and every message fans out over a socket to everyone in it.
  { body: roomMessageSchema, rateLimit: 'chat' },
  async ({ params, body, actor }) => {
    const id = objectId.parse(params.id);
    const room = await StudyRoom.findById(id);
    if (!room) throw ApiError.notFound('Room not found');

    if (!room.isGlobal && room.campus !== actor.campus && actor.role !== 'alumni') {
      throw ApiError.notFound('Room not found');
    }

    const message = await RoomMessage.create({
      room: id,
      author: actor.id,
      content: body.content,
    });

    const populated = await message.populate('author', 'name image badges');

    try {
      await pusherServer.trigger(`room-${id}`, 'new-message', populated.toJSON());
    } catch (error) {
      // The message is stored; realtime fan-out failing must not fail the send.
      console.error('[pusher] room delivery failed:', error);
    }

    return created(populated);
  }
);
