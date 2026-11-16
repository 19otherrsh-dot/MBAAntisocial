'use client';

import { useEffect, useRef } from 'react';
import type PusherClient from 'pusher-js';
import type { Channel } from 'pusher-js';

/**
 * Browser side of realtime delivery.
 *
 * The connection is created on first use rather than at import, so a
 * deployment without Pusher keys simply has no realtime instead of throwing
 * while the app shell loads.
 */
let clientPromise: Promise<PusherClient | null> | null = null;

function getClient(): Promise<PusherClient | null> {
  if (clientPromise) return clientPromise;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) {
    clientPromise = Promise.resolve(null);
    return clientPromise;
  }

  // Loaded on demand: the socket library stays out of the initial bundle.
  clientPromise = import('pusher-js')
    .then(
      ({ default: Pusher }) =>
        new Pusher(key, {
          cluster,
          // Private channels are signed here, with the session cookie.
          channelAuthorization: { endpoint: '/api/pusher/auth', transport: 'ajax' },
        })
    )
    .catch(() => null);
  return clientPromise;
}

/*
 * Subscriptions are reference-counted per channel. Two components listening on
 * the same channel share one subscription, and the channel is only left when
 * the last of them unmounts — previously, leaving the messages page
 * unsubscribed the shared user channel and silently killed the notification
 * bell with it.
 */
const refCounts = new Map<string, number>();

/**
 * Calls `handler` for each `event` on `channelName`. Pass `null` to stay idle.
 *
 * The handler is read through a ref, so it may close over fresh state on every
 * render without tearing the subscription down and re-joining the channel.
 */
export function useRealtime<T>(
  channelName: string | null,
  event: string,
  handler: (payload: T) => void
): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!channelName) return;

    let cancelled = false;
    let channel: Channel | null = null;
    let client: PusherClient | null = null;
    const listener = (payload: T) => latest.current(payload);

    getClient().then((resolved) => {
      if (cancelled || !resolved) return;
      client = resolved;
      refCounts.set(channelName, (refCounts.get(channelName) ?? 0) + 1);
      channel = client.subscribe(channelName);
      channel.bind(event, listener);
    });

    return () => {
      cancelled = true;
      if (!channel || !client) return;
      channel.unbind(event, listener);
      const remaining = (refCounts.get(channelName) ?? 1) - 1;
      if (remaining <= 0) {
        refCounts.delete(channelName);
        client.unsubscribe(channelName);
      } else {
        refCounts.set(channelName, remaining);
      }
    };
  }, [channelName, event]);
}
