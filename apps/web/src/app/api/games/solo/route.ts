import { route, ok } from '@/lib/api/handler';
import { soloResultSchema } from '@/server/modules/games/schemas';
import { recordSoloResult } from '@/server/modules/games/results';

/** Vs-bot and pass-and-play games: history and completion points, never ratings. */
export const POST = route({ body: soloResultSchema, rateLimit: 'game', feature: 'games' }, async ({ actor, body }) => {
  return ok(await recordSoloResult(actor, body.gameId, body.mode, body.result));
});
