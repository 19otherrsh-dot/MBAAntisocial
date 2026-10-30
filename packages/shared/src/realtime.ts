/**
 * Wire contract between the web API (which publishes), the realtime service
 * (which fans out), and every client (which subscribes).
 *
 * The realtime service holds no domain data. It authenticates a socket with a
 * short-lived token minted by the web app, asks the web app whether a socket
 * may join a topic, and relays whatever the web app publishes to that topic.
 * Domain rules therefore live in exactly one place.
 */

/** Topic names. Everything a client can subscribe to is one of these shapes. */
export const topics = {
  user: (userId: string) => `user:${userId}`,
  campus: (campusSlug: string) => `campus:${campusSlug}`,
  hubServer: (serverId: string) => `hub-server:${serverId}`,
  hubChannel: (channelId: string) => `hub-channel:${channelId}`,
  dm: (conversationId: string) => `dm:${conversationId}`,
  gameRoom: (roomId: string) => `game-room:${roomId}`,
  tournament: (tournamentId: string) => `tournament:${tournamentId}`,
} as const;

export type TopicKind = keyof typeof topics;

export function parseTopic(topic: string): { kind: TopicKind; id: string } | null {
  const idx = topic.indexOf(':');
  if (idx <= 0) return null;
  const prefix = topic.slice(0, idx);
  const id = topic.slice(idx + 1);
  const map: Record<string, TopicKind> = {
    user: 'user',
    campus: 'campus',
    'hub-server': 'hubServer',
    'hub-channel': 'hubChannel',
    dm: 'dm',
    'game-room': 'gameRoom',
    tournament: 'tournament',
  };
  const kind = map[prefix];
  if (!kind || !/^[a-z0-9-]{1,64}$/i.test(id)) return null;
  return { kind, id };
}

/** Events the web app publishes. The payload shape is fixed per event name. */
export interface RealtimeEvents {
  'notification.created': { id: string; title: string; body: string; href: string; kind: string; createdAt: string };
  'notification.count': { unread: number };
  'hub.message.created': { channelId: string; message: unknown };
  'hub.message.updated': { channelId: string; message: unknown };
  'hub.message.deleted': { channelId: string; messageId: string };
  'hub.reaction': { channelId: string; messageId: string; reactions: Array<{ emoji: string; count: number; userIds: string[] }> };
  'hub.channel.updated': { serverId: string; channel: unknown };
  'hub.channel.deleted': { serverId: string; channelId: string };
  'hub.server.updated': { serverId: string };
  'hub.member.updated': { serverId: string; userId: string };
  'hub.voice.participants': { channelId: string; participants: Array<{ userId: string; name: string }> };
  /** Lightweight "something happened in this channel" for sidebars and unread badges. */
  'hub.activity': { serverId: string; channelId: string; messageId: string; authorId: string; mentions: string[]; at: string };
  'dm.message.created': { conversationId: string; message: unknown };
  'dm.message.updated': { conversationId: string; message: unknown };
  'game.room.updated': { roomId: string; room: unknown };
  'game.room.started': { roomId: string };
  'game.room.finished': { roomId: string; summary: string };
  /** Someone pressed "Play again": the finished room points at the new lobby. */
  'game.room.rematch': { roomId: string; rematchId: string; from: string };
  'game.invite': { roomId: string; code: string; gameId: string; gameTitle: string; from: string };
  'tournament.updated': { tournamentId: string };
  'feed.post.created': { postId: string };
}

export type RealtimeEventName = keyof RealtimeEvents;

export interface RealtimeEnvelope<E extends RealtimeEventName = RealtimeEventName> {
  topic: string;
  event: E;
  data: RealtimeEvents[E];
  /** Server time the event was published, ISO. */
  at: string;
}

/** Ephemeral signals that never touch the database. */
export interface TypingSignal {
  topic: string;
  userId: string;
  name: string;
}

export interface PresenceSignal {
  userId: string;
  status: 'online' | 'idle' | 'offline';
}

export interface ServerToClientEvents {
  event: (envelope: RealtimeEnvelope) => void;
  typing: (signal: TypingSignal) => void;
  presence: (signal: PresenceSignal) => void;
  /** Sent once after a successful handshake. */
  ready: (info: { userId: string; serverTime: string }) => void;
  error_message: (info: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  subscribe: (topic: string, ack: (result: { ok: boolean; error?: string }) => void) => void;
  unsubscribe: (topic: string) => void;
  typing: (topic: string) => void;
  presence: (status: 'online' | 'idle') => void;
  /** Ask who of a list of user ids is online right now. */
  who: (userIds: string[], ack: (online: string[]) => void) => void;
}

/** Claims in the socket handshake token (HS256, signed with REALTIME_SECRET). */
export interface RealtimeTokenClaims {
  sub: string;
  name: string;
  campus: string;
  /** Token use, so a game ticket can never be replayed as a socket token. */
  use: 'socket';
}

/** Claims in a game-room ticket handed to a Godot build. */
export interface GameTicketClaims {
  sub: string;
  name: string;
  room: string;
  game: string;
  /** Seat index, or -1 for a spectator. */
  seat: number;
  /** 1 for the room host (WebRTC server peer), otherwise assigned in join order. */
  host: boolean;
  transport: 'webrtc' | 'relay' | 'dedicated';
  use: 'game';
}

/** Redis channel the web app publishes envelopes on. */
export const REALTIME_REDIS_CHANNEL = 'mba:realtime:events';
/** Redis key prefix for presence counters. */
export const PRESENCE_KEY_PREFIX = 'mba:presence:';
/** Seconds a presence key lives without a heartbeat. */
export const PRESENCE_TTL_SECONDS = 90;
export const TYPING_THROTTLE_MS = 2500;
