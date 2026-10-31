import { RoomServiceClient } from 'livekit-server-sdk';
import { route, ok } from '@/lib/api/handler';
import { env } from '@/lib/env';
import { requireChannel } from '@/server/modules/hub/access';

/** Who is in a voice channel right now, straight from LiveKit. */
export const GET = route({ feature: 'hub' }, async ({ actor, params }) => {
  const { channel } = await requireChannel(actor.id, params.id);
  if (channel.kind !== 'voice' || !env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) {
    return ok({ participants: [], available: Boolean(env.LIVEKIT_URL) });
  }
  try {
    // The server API speaks HTTP(S) on the same host: ws→http, wss→https (a local or self-hosted server is often plain).
    const client = new RoomServiceClient(env.LIVEKIT_URL.replace(/^ws(s?):/, 'http$1:'), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
    const participants = await client.listParticipants(`hub-${channel._id}`);
    return ok({ participants: participants.map((p) => ({ userId: p.identity, name: p.name })), available: true });
  } catch {
    // A room with nobody in it does not exist yet.
    return ok({ participants: [], available: true });
  }
});
