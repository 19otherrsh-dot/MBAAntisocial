import PusherServer from 'pusher';
import { env } from './env';

/**
 * Realtime is optional infrastructure. Without credentials the app still works
 * — a message or notification shows up on the recipient's next load — so the
 * client is built lazily and its absence is a no-op rather than a crash at
 * import time.
 */
let client: PusherServer | null | undefined;

export function getPusher(): PusherServer | null {
  if (client !== undefined) return client;
  client = env.pusherConfigured
    ? new PusherServer({
        appId: env.PUSHER_APP_ID!,
        key: env.NEXT_PUBLIC_PUSHER_KEY!,
        secret: env.PUSHER_SECRET!,
        cluster: env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        useTLS: true,
      })
    : null;
  return client;
}

/**
 * Best-effort fan-out. The write this accompanies has already been stored, so
 * a delivery failure is logged and swallowed — it must never fail the request.
 */
export async function publish(channel: string, event: string, payload: unknown): Promise<void> {
  const pusher = getPusher();
  if (!pusher) return;
  try {
    await pusher.trigger(channel, event, payload);
  } catch (error) {
    console.error(`[pusher] ${event} on ${channel} failed:`, error);
  }
}
