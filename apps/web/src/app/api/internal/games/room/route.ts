import { z } from 'zod';
import { internalRoute, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import GameRoom from '@/models/games/GameRoom';
import { getGame } from '@/server/modules/games/registry';

const schema = z.object({ roomId: z.string().regex(/^[a-f0-9]{24}$/) });

/** What the realtime service needs to launch a dedicated server for a room. */
export const POST = internalRoute({ body: schema }, async ({ body }) => {
  const room = await GameRoom.findById(body.roomId).select('game status maxPlayers').lean();
  if (!room) throw ApiError.notFound('Unknown room.');
  const game = await getGame(room.game);
  return ok({
    gameId: room.game,
    version: game?.build?.version ?? '',
    serverPack: game?.build?.serverPack ?? '',
    maxPlayers: room.maxPlayers,
    status: room.status,
  });
});
