import { z } from 'zod';
import { internalRoute, ok } from '@/lib/api/handler';
import { authorizeTopic } from '@/server/modules/realtime/authorize';

const schema = z.object({
  userId: z.string().regex(/^[a-f0-9]{24}$/),
  topic: z.string().min(3).max(100),
});

/** Called by apps/realtime before a socket joins a topic. */
export const POST = internalRoute({ body: schema }, async ({ body }) => {
  return ok({ allowed: await authorizeTopic(body.userId, body.topic) });
});
