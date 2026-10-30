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
  /**
   * Reference-counted: the topic is left only when its last subscriber unmounts.
   * `onSubscribed` runs each time the server confirms the subscription (first
   * join and every reconnect), so a page can refetch what it missed meanwhile.
   */
  retain: (topic: string, onSubscribed?: () => void) => void;
  release: (topic: string, onSubscribed?: () => void) => void;
}

const RealtimeContext = createContext<RealtimeApi>({ socket: null, connected: false, retain: () => undefined, release: () => undefined });

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

  const counts = useRef(new Map<string, number>());
  const onJoin = useRef(new Map<string, Set<() => void>>());
  const joined = useCallback((topic: string) => (result: { ok: boolean }) => {
    if (result?.ok) onJoin.current.get(topic)?.forEach((fn) => fn());
  }, []);

  // Re-join every retained topic after a reconnect.
  useEffect(() => {
    if (!socket || !connected) return;
    for (const topic of counts.current.keys()) socket.emit('subscribe', topic, joined(topic));
  }, [socket, connected, joined]);

  const retain = useCallback(
    (topic: string, onSubscribed?: () => void) => {
      if (onSubscribed) {
        const set = onJoin.current.get(topic) ?? new Set();
        set.add(onSubscribed);
        onJoin.current.set(topic, set);
      }
      const next = (counts.current.get(topic) ?? 0) + 1;
      counts.current.set(topic, next);
      if (next === 1 && socket?.connected) socket.emit('subscribe', topic, joined(topic));
    },
    [socket, joined]
  );

  const release = useCallback(
    (topic: string, onSubscribed?: () => void) => {
      if (onSubscribed) onJoin.current.get(topic)?.delete(onSubscribed);
      const next = (counts.current.get(topic) ?? 0) - 1;
      if (next > 0) {
        counts.current.set(topic, next);
        return;
      }
      counts.current.delete(topic);
      if (socket?.connected) socket.emit('unsubscribe', topic);
    },
    [socket]
  );

  const value = useMemo(() => ({ socket, connected, retain, release }), [socket, connected, retain, release]);
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
  onEvent: (envelope: RealtimeEnvelope) => void,
  options: { onSubscribed?: () => void } = {}
): void {
  const { socket, retain, release } = useRealtime();
  const handler = useRef(onEvent);
  const subscribed = useRef(options.onSubscribed);

  useEffect(() => {
    handler.current = onEvent;
    subscribed.current = options.onSubscribed;
  });

  useEffect(() => {
    if (!socket || !topic) return;
    const onSubscribed = () => subscribed.current?.();
    retain(topic, onSubscribed);
    const listener = (envelope: RealtimeEnvelope) => {
      if (envelope.topic === topic) handler.current(envelope);
    };
    socket.on('event', listener);
    return () => {
      socket.off('event', listener);
      release(topic, onSubscribed);
    };
  }, [socket, topic, retain, release]);
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
