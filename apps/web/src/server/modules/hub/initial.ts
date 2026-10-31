import { unstable_rethrow } from 'next/navigation';
import { featureAvailable } from '@mba/shared/campus';
import { sessionActor } from '@/lib/api/handler';
import { serversForUser } from './service';
import { serverDetail } from './detail';

export interface HubInitial {
  servers: unknown[];
  /** The server whose detail was loaded (the requested one, else the first). */
  serverId: string | null;
  detail: unknown | null;
}

/**
 * What the hub's first paint needs (the server rail and the active server's
 * channels), loaded on the server so the page arrives filled in instead of
 * waiting on two client round trips. Shapes match the API exactly. Anything
 * unusual (signed out, no access, an error) returns null and the client
 * fetches as before.
 */
export async function hubInitial(requestedServerId?: string): Promise<HubInitial | null> {
  try {
    const actor = await sessionActor();
    if (!actor?.verified || !featureAvailable('hub', actor.edition)) return null;
    const servers = (await serversForUser(actor.id, actor.campus)).map((s) => ({ ...s, _id: String(s._id) }));
    const serverId = requestedServerId ?? servers[0]?._id ?? null;
    const detail = serverId ? await serverDetail(actor.id, serverId).catch(() => null) : null;
    return JSON.parse(JSON.stringify({ servers, serverId, detail })) as HubInitial;
  } catch (error) {
    // Next's own signals (dynamic rendering, redirects) must pass through, not be logged as failures.
    unstable_rethrow(error);
    console.error('[hub] server render failed; the client will fetch', error);
    return null;
  }
}
