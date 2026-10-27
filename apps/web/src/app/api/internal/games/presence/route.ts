import { z } from 'zod';
import { internalRoute, ok } from '@/lib/api/handler';
import { setPresence } from '@/server/modules/games/rooms';

const schema = z.object({
  roomId: z.string().regex(/^[a-f0-9]{24}$/),
  userId: z.string().regex(/^[a-f0-9]{24}$/),
  present: z.boolean(),
});

/** The realtime service reporting a player's game socket opening or closing. */
export const POST = internalRoute({ body: schema }, async ({ body }) => {
  await setPresence(body.roomId, body.userId, body.present);
  return ok({ ok: true });
});
