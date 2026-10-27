import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  PRESENCE_KEY_PREFIX,
  PRESENCE_TTL_SECONDS,
  REALTIME_REDIS_CHANNEL,
  parseTopic,
  topics,
  type ClientToServerEvents,
  type PresenceSignal,
  type ServerToClientEvents,
  type TypingSignal,
} from '@mba/shared/realtime';
import { config } from './config.js';
import { isEnvelope, SIGNAL_CHANNEL, type Bus } from './bus.js';
import { verifySocketToken } from './tokens.js';
import { canSubscribe } from './web.js';

interface SocketData {
  userId: string;
  name: string;
  campus: string;
  topics: Set<string>;
}

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const MAX_TOPICS_PER_SOCKET = 200;

type Signal = { kind: 'typing'; payload: TypingSignal } | { kind: 'presence'; payload: PresenceSignal };

/**
 * Socket.IO fan-out. Each socket authenticates with a token minted by the web
 * app, joins topics only after the web app authorises them, and receives the
 * envelopes the web app publishes on Redis.
 */
export function attachSockets(httpServer: HttpServer, bus: Bus): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024,
    // Game WebSockets share this HTTP server; leave their upgrades alone.
    destroyUpgrade: false,
  });

  // Local presence counts, mirrored to Redis so the web app can read them.
  const localConnections = new Map<string, number>();

  async function setPresence(userId: string, delta: 1 | -1) {
    const next = (localConnections.get(userId) ?? 0) + delta;
    if (next <= 0) localConnections.delete(userId);
    else localConnections.set(userId, next);

    if (bus.redis) {
      const key = PRESENCE_KEY_PREFIX + userId;
      const value = await bus.redis.incrby(key, delta);
      if (value <= 0) await bus.redis.del(key);
      else await bus.redis.expire(key, PRESENCE_TTL_SECONDS);
    }
  }

  // Heartbeat: keep presence keys alive for everyone connected here.
  setInterval(() => {
    if (!bus.redis) return;
    const pipeline = bus.redis.pipeline();
    for (const userId of localConnections.keys()) pipeline.expire(PRESENCE_KEY_PREFIX + userId, PRESENCE_TTL_SECONDS);
    pipeline.exec().catch(() => undefined);
  }, (PRESENCE_TTL_SECONDS * 1000) / 3).unref();

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    const claims = token ? await verifySocketToken(token) : null;
    if (!claims) return next(new Error('unauthorized'));
    socket.data.userId = claims.sub;
    socket.data.name = claims.name;
    socket.data.campus = claims.campus;
    socket.data.topics = new Set();
    next();
  });

  io.on('connection', (socket: AppSocket) => {
    const { userId } = socket.data;
    // Everyone is always in their own user topic.
    const own = topics.user(userId);
    void socket.join(own);
    socket.data.topics.add(own);
    void setPresence(userId, 1);
    socket.emit('ready', { userId, serverTime: new Date().toISOString() });

    socket.on('subscribe', async (topic, ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      if (typeof topic !== 'string' || !parseTopic(topic)) return reply({ ok: false, error: 'bad_topic' });
      if (socket.data.topics.has(topic)) return reply({ ok: true });
      if (socket.data.topics.size >= MAX_TOPICS_PER_SOCKET) return reply({ ok: false, error: 'too_many_topics' });
      if (!(await canSubscribe(userId, topic))) return reply({ ok: false, error: 'forbidden' });
      await socket.join(topic);
      socket.data.topics.add(topic);
      reply({ ok: true });
    });

    socket.on('unsubscribe', (topic) => {
      if (typeof topic !== 'string' || topic === own) return;
      void socket.leave(topic);
      socket.data.topics.delete(topic);
    });

    socket.on('typing', (topic) => {
      // Only into a topic the socket was authorised to join.
      if (typeof topic !== 'string' || !socket.data.topics.has(topic) || topic === own) return;
      const signal: Signal = { kind: 'typing', payload: { topic, userId, name: socket.data.name } };
      void bus.publish(SIGNAL_CHANNEL, JSON.stringify(signal));
    });

    socket.on('who', async (userIds, ack) => {
      if (!Array.isArray(userIds) || typeof ack !== 'function') return;
      const ids = userIds.filter((id): id is string => typeof id === 'string').slice(0, 200);
      if (!bus.redis) return ack(ids.filter((id) => localConnections.has(id)));
      const values = ids.length ? await bus.redis.mget(ids.map((id) => PRESENCE_KEY_PREFIX + id)) : [];
      ack(ids.filter((_, i) => Number(values[i] ?? 0) > 0));
    });

    socket.on('disconnect', () => {
      void setPresence(userId, -1);
    });
  });

  bus.onMessage((channel, message) => {
    if (channel === REALTIME_REDIS_CHANNEL) {
      try {
        const envelope = JSON.parse(message);
        if (isEnvelope(envelope)) io.to(envelope.topic).emit('event', envelope);
      } catch {
        /* ignore malformed */
      }
    } else if (channel === SIGNAL_CHANNEL) {
      try {
        const signal = JSON.parse(message) as Signal;
        if (signal.kind === 'typing') io.to(signal.payload.topic).emit('typing', signal.payload);
      } catch {
        /* ignore malformed */
      }
    }
  });
  void bus.subscribe(REALTIME_REDIS_CHANNEL);
  void bus.subscribe(SIGNAL_CHANNEL);

  return io;
}
