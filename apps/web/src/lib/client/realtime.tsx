'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  RealtimeEnvelope,
  RealtimeEventName,
  RealtimeEvents,
  ServerToClientEvents,
  TypingSignal,
} from '@mba/shared/realtime';
import { TYPING_THROTTLE_MS } from '@mba/shared/realtime';
import { api } from './api';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface RealtimeApi {
  socket: AppSocket | null;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeApi>({ socket: null, connected: false });

/**
 * One socket per tab, opened once the shell mounts. When no realtime service is
 * configured the token endpoint returns `url: null` and every hook below is a
 * no-op — pages keep working on plain request/response.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let instance: AppSocket | null = null;

    api
      .get<{ url: string | null; token: string | null }>('/api/realtime/token')
      .then(({ url, token }) => {
        if (cancelled || !url || !token) return;
        instance = io(url, {
          transports: ['websocket'],
          // Re-mint on every (re)connect so an expired token never strands the socket.
          auth: (cb) => {
            api
              .get<{ token: string | null }>('/api/realtime/token')
              .then((fresh) => cb({ token: fresh.token ?? token }))
              .catch(() => cb({ token }));
          },
        });
        instance.on('connect', () => setConnected(true));
        instance.on('disconnect', () => setConnected(false));
        setSocket(instance);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      instance?.disconnect();
    };
  }, []);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeApi {
  return useContext(RealtimeContext);
}

/**
 * Subscribes to a topic for as long as the component is mounted and calls
 * `onEvent` for each envelope. The handler is kept in a ref, so callers can
 * pass an inline function without resubscribing every render.
 */
export function useTopic(
  topic: string | null,
  onEvent: (envelope: RealtimeEnvelope) => void
): void {
  const { socket, connected } = useRealtime();
  const handler = useRef(onEvent);

  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    if (!socket || !connected || !topic) return;
    socket.emit('subscribe', topic, () => undefined);
    const listener = (envelope: RealtimeEnvelope) => {
      if (envelope.topic === topic) handler.current(envelope);
    };
    socket.on('event', listener);
    return () => {
      socket.off('event', listener);
      socket.emit('unsubscribe', topic);
    };
  }, [socket, connected, topic]);
}

/** Typed narrowing helper for envelope handlers. */
export function isEvent<E extends RealtimeEventName>(
  envelope: RealtimeEnvelope,
  event: E
): envelope is RealtimeEnvelope<E> & { data: RealtimeEvents[E] } {
  return envelope.event === event;
}

/**
 * Who is typing in a topic, plus a throttled `notifyTyping` to call on input.
 * Entries expire after a few seconds without a fresh signal.
 */
export function useTyping(topic: string | null, selfId: string | undefined) {
  const { socket, connected } = useRealtime();
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});
  const lastSent = useRef(0);

  useEffect(() => {
    if (!socket || !connected || !topic) return;
    const onTyping = (signal: TypingSignal) => {
      if (signal.topic !== topic || signal.userId === selfId) return;
      setTyping((current) => ({ ...current, [signal.userId]: { name: signal.name, at: Date.now() } }));
    };
    socket.on('typing', onTyping);
    const sweep = setInterval(() => {
      setTyping((current) => {
        const cutoff = Date.now() - 5000;
        const next = Object.fromEntries(Object.entries(current).filter(([, v]) => v.at > cutoff));
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 1500);
    return () => {
      socket.off('typing', onTyping);
      clearInterval(sweep);
    };
  }, [socket, connected, topic, selfId]);

  const notifyTyping = useCallback(() => {
    if (!socket || !topic) return;
    const now = Date.now();
    if (now - lastSent.current < TYPING_THROTTLE_MS) return;
    lastSent.current = now;
    socket.emit('typing', topic);
  }, [socket, topic]);

  const names = Object.values(typing).map((t) => t.name);
  return { names, notifyTyping };
}
