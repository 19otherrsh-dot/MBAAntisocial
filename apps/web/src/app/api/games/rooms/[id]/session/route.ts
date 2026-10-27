import { route, ok } from '@/lib/api/handler';
import { sessionSchema } from '@/server/modules/games/schemas';
import { bridgeInitForRoom, loadRoom } from '@/server/modules/games/rooms';

/** The `init` payload the player page hands to the game build, ticket included. */
export const POST = route({ body: sessionSchema, rateLimit: 'game', feature: 'games' }, async ({ actor, params, body }) => {
  const room = await loadRoom(params.id, actor);
  return ok({ init: await bridgeInitForRoom(room, actor, body.environment) });
});
