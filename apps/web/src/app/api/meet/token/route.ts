import { z } from 'zod';
import { AccessToken } from 'livekit-server-sdk';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { env } from '@/lib/env';
import { resolveRoom } from '@/server/modules/meet/rooms';

const querySchema = z.object({ room: z.string().regex(/^[a-z]+-[a-z0-9-]{1,80}$/i) });

/**
 * Mints a LiveKit token for a built-in room after the owning module confirms
 * the caller belongs there. Tokens are short-lived and name the room exactly.
 */
export const GET = route({ query: querySchema, rateLimit: 'write' }, async ({ actor, query }) => {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    throw new ApiError(503, 'video_unavailable', 'Built-in video is not configured on this deployment.');
  }
  const access = await resolveRoom(actor, query.room);
  if (!access.allowed) throw ApiError.notFound('That room does not exist or is not yours.');

  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: actor.id,
    name: actor.name,
    ttl: '2h',
  });
  token.addGrant({
    room: query.room,
    roomJoin: true,
    canPublish: access.canPublish,
    canSubscribe: true,
    canPublishData: true,
  });

  return ok({ token: await token.toJwt(), url: env.LIVEKIT_URL, title: access.title, backHref: access.backHref });
});
