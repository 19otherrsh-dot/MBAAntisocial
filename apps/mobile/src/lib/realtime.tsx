import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RealtimeEnvelope, ServerToClientEvents } from '@mba/shared/realtime';
import { api } from './api';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const RealtimeContext = createContext<AppSocket | null>(null);

/**
 * One socket while signed in, speaking the same protocol as the web client.
 * Without a realtime service the token endpoint returns `url: null` and every
 * screen simply works on request/response.
 */
export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [socket, setSocket] = useState<AppSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;
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
        setSocket(instance);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      instance?.disconnect();
      setSocket(null);
    };
  }, [enabled]);

  return <RealtimeContext.Provider value={socket}>{children}</RealtimeContext.Provider>;
}

/** Calls `onEvent` for each event on `topic` while mounted. */
export function useTopic(topic: string | null, onEvent: (envelope: RealtimeEnvelope) => void) {
  const socket = useContext(RealtimeContext);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  useEffect(() => {
    if (!socket || !topic) return;
    const join = () => socket.emit('subscribe', topic, () => undefined);
    const listener = (envelope: RealtimeEnvelope) => {
      if (envelope.topic === topic) handler.current(envelope);
    };
    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('event', listener);
    return () => {
      socket.off('connect', join);
      socket.off('event', listener);
      socket.emit('unsubscribe', topic);
    };
  }, [socket, topic]);
}
