import { route, created } from '@/lib/api/handler';
import { createRoomSchema } from '@/server/modules/games/schemas';
import { createRoom, viewRoom } from '@/server/modules/games/rooms';

/** Opens a new table with the caller in seat one. */
export const POST = route({ body: createRoomSchema, rateLimit: 'game', feature: 'games' }, async ({ actor, body }) => {
  const room = await createRoom(actor, body);
  return created({ room: await viewRoom(room) });
});
