import { route, ok, created } from '@/lib/api/handler';
import StudyRoom from '@/models/StudyRoom';
import { createRoomSchema } from '@/lib/validation';

export const GET = route({}, async ({ actor }) => {
  const rooms = await StudyRoom.find({
    $or: [{ campus: actor.campus }, { isGlobal: true }],
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .populate('createdBy', 'name image badges')
    .lean();

  return ok(rooms);
});

export const POST = route({ body: createRoomSchema, rateLimit: 'post' }, async ({ actor, body }) => {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + body.durationHours);

  const room = await StudyRoom.create({
    title: body.title,
    topic: body.topic,
    isGlobal: body.isGlobal,
    campus: actor.campus,
    createdBy: actor.id,
    expiresAt,
  });

  return created(room);
});
