import { route, ok } from '@/lib/api/handler';
import { env } from '@/lib/env';
import { mintSocketToken } from '@/server/modules/realtime/tokens';

/**
 * Mints a short-lived socket token. Returns `url: null` when no realtime
 * service is configured, and the client simply stays on request/response.
 */
export const GET = route({}, async ({ actor }) => {
  if (!env.NEXT_PUBLIC_REALTIME_URL) return ok({ url: null, token: null });
  const token = await mintSocketToken({ sub: actor.id, name: actor.name, campus: actor.campus });
  return ok({ url: env.NEXT_PUBLIC_REALTIME_URL, token });
});
