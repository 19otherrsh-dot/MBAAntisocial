import { route, ok } from '@/lib/api/handler';
import { roomCodeSchema } from '@/server/modules/games/schemas';
import { roomByCode } from '@/server/modules/games/rooms';

/** Resolves a six-character table code to a room id. */
export const POST = route({ body: roomCodeSchema, rateLimit: 'game', feature: 'games' }, async ({ actor, body }) => {
  const room = await roomByCode(body.code, actor);
  return ok({ roomId: String(room._id), game: room.game });
});
