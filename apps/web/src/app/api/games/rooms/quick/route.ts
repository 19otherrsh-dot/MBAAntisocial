import { route, ok } from '@/lib/api/handler';
import { quickMatchSchema } from '@/server/modules/games/schemas';
import { quickMatch, viewRoom } from '@/server/modules/games/rooms';

/** Seats the caller at the best open table, or opens one others can find. */
export const POST = route({ body: quickMatchSchema, rateLimit: 'game', feature: 'games' }, async ({ actor, body }) => {
  const room = await quickMatch(actor, body.gameId);
  return ok({ room: await viewRoom(room) });
});
