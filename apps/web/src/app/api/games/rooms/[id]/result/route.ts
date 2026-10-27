import { route, ok } from '@/lib/api/handler';
import { resultSchema } from '@/server/modules/games/schemas';
import { loadRoom, viewRoom } from '@/server/modules/games/rooms';
import { submitResult } from '@/server/modules/games/results';

/** A player's report of the final standings; settled by majority. */
export const POST = route({ body: resultSchema, rateLimit: 'game', feature: 'games' }, async ({ actor, params, body }) => {
  const room = await loadRoom(params.id, actor);
  const { state, room: next } = await submitResult(room, actor, body.result);
  return ok({ state, room: await viewRoom(next) });
});
