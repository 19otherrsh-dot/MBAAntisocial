import { z } from 'zod';

/**
 * The games platform's contracts: what a game declares about itself, the
 * messages it exchanges with the host page, and the pure rules (ratings,
 * brackets, result consensus) the server applies to what it reports.
 *
 * Games are Godot 4 HTML5 exports. The platform never runs game logic itself —
 * it hosts the build, hands it an identity and a room, carries its network
 * traffic, and records the outcome.
 */

export const GAME_CATEGORIES = ['board', 'strategy', 'cards', 'business', 'quiz', 'casual'] as const;
export type GameCategory = (typeof GAME_CATEGORIES)[number];

export const GAME_CATEGORY_META: Record<GameCategory, { label: string }> = {
  board: { label: 'Classic board' },
  strategy: { label: 'Strategy' },
  cards: { label: 'Cards' },
  business: { label: 'B-school' },
  quiz: { label: 'Quiz' },
  casual: { label: 'Quick games' },
};

export const GAME_MODES = ['online', 'bot', 'local', 'tournament'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export const GAME_MODE_META: Record<GameMode, { label: string; blurb: string }> = {
  online: { label: 'Online', blurb: 'Play friends or get matched with your campus.' },
  bot: { label: 'Vs bot', blurb: 'Solo against the computer.' },
  local: { label: 'Pass & play', blurb: 'Several people, one device.' },
  tournament: { label: 'Tournament', blurb: 'Bracketed, rated, with a winner.' },
};

/**
 * How a game's multiplayer traffic travels.
 *
 * - `none`: single-device only (bot and pass-and-play).
 * - `webrtc`: Godot's `WebRTCMultiplayerPeer`. The platform runs the signaling
 *   server (protocol-compatible with Godot's official webrtc_signaling demo)
 *   and supplies ICE servers; peers talk directly. Best for turn-based games.
 * - `relay`: raw `WebSocketPeer` to a room relay that fans each frame out to the
 *   other seats. For games with their own lightweight protocol.
 * - `dedicated`: a headless Godot server build per room, started on demand by
 *   the realtime service and reached through an authenticated WebSocket proxy.
 *   The only transport whose reported results are trusted without consensus.
 */
export const NETWORK_TRANSPORTS = ['none', 'webrtc', 'relay', 'dedicated'] as const;
export type NetworkTransport = (typeof NETWORK_TRANSPORTS)[number];

const slug = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and dashes.');

export const gameManifestSchema = z
  .object({
    /** Stable id; also the folder name under /games. */
    id: slug,
    title: z.string().min(2).max(60),
    tagline: z.string().max(120).default(''),
    description: z.string().max(2000).default(''),
    category: z.enum(GAME_CATEGORIES),
    minPlayers: z.number().int().min(1).max(16),
    maxPlayers: z.number().int().min(1).max(16),
    modes: z.array(z.enum(GAME_MODES)).min(1),
    estimatedMinutes: z.number().int().min(1).max(240).default(15),
    /** Shown on the card; relative to the build folder or absolute. */
    thumbnail: z.string().max(500).default(''),
    orientation: z.enum(['landscape', 'portrait', 'any']).default('any'),
    /** Present once a build has been published. Absent means "coming soon". */
    build: z
      .object({
        version: z.string().min(1).max(32),
        /** HTML entry, relative to `assetBase`. Usually `index.html`. */
        entry: z.string().min(1).max(200).default('index.html'),
        /**
         * Where the export lives. A path under `/games/` on this origin, or an
         * absolute CDN URL that serves CORS and CORP headers.
         */
        assetBase: z.string().min(1).max(500),
        /** Threaded exports need SharedArrayBuffer, i.e. cross-origin isolation. */
        threads: z.boolean().default(false),
        /** Approximate download, so the player can warn on mobile data. */
        sizeMb: z.number().min(0).max(2048).default(0),
        /** Dedicated transport only: the headless server pack to launch. */
        serverPack: z.string().max(500).optional(),
        publishedAt: z.string().optional(),
      })
      .optional(),
    network: z
      .object({
        transport: z.enum(NETWORK_TRANSPORTS).default('none'),
        /** Whether a late joiner may watch. */
        spectators: z.boolean().default(true),
        /** Whether a seat can be filled by the platform's bot when someone leaves. */
        botBackfill: z.boolean().default(false),
      })
      .default({ transport: 'none', spectators: true, botBackfill: false }),
    rated: z.boolean().default(true),
    /** Points paid for finishing a game (daily-capped server-side). */
    completionPoints: z.number().int().min(0).max(20).default(2),
    tags: z.array(z.string().max(24)).max(10).default([]),
    /** Content advisory: no gambling mechanics with real value, ever. */
    realMoney: z.literal(false).default(false),
  })
  .refine((m) => m.maxPlayers >= m.minPlayers, { message: 'maxPlayers must be ≥ minPlayers', path: ['maxPlayers'] })
  .refine((m) => !m.modes.includes('online') || m.network.transport !== 'none', {
    message: 'An online game needs a network transport.',
    path: ['network', 'transport'],
  })
  .refine((m) => m.network.transport !== 'dedicated' || !m.build || Boolean(m.build.serverPack), {
    message: 'A dedicated-server game needs build.serverPack.',
    path: ['build', 'serverPack'],
  });

export type GameManifest = z.infer<typeof gameManifestSchema>;

/* ───────────────────────── Host ⇄ game bridge ───────────────────────── */

/**
 * Version of the postMessage protocol. A game declares the version it speaks
 * in `ready`; the host refuses to start a game on a newer major it cannot serve.
 */
export const BRIDGE_PROTOCOL_VERSION = 1;
export const BRIDGE_NAMESPACE = 'antisocial';

export interface BridgePlayer {
  id: string;
  name: string;
  avatar: string;
  rating: number | null;
  /** Seat index in the room, 0-based; null for a spectator. */
  seat: number | null;
  isBot?: boolean;
}

export interface BridgeInit {
  protocol: number;
  gameId: string;
  mode: GameMode;
  /** The signed-in player. */
  player: BridgePlayer;
  room: {
    id: string;
    code: string;
    hostId: string;
    players: BridgePlayer[];
    spectating: boolean;
    tournamentMatchId: string | null;
    /** Free-form options chosen in the lobby (board size, house rules...). */
    options: Record<string, string | number | boolean>;
  } | null;
  network: {
    transport: NetworkTransport;
    /** webrtc: signaling WebSocket. relay/dedicated: game WebSocket. */
    url: string | null;
    /** Short-lived ticket, appended as `?ticket=` by the SDK. */
    ticket: string | null;
    iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
    /** webrtc only: the peer id this player will be assigned (host = 1). */
    expectedPeerId: number | null;
  };
  bot: { difficulty: 'easy' | 'medium' | 'hard' } | null;
  environment: {
    platform: 'web' | 'ios' | 'android';
    locale: string;
    theme: 'light' | 'dark';
    reducedMotion: boolean;
    muted: boolean;
  };
}

/** Final standings. Placement 1 is the winner; equal placements are ties. */
export interface GameResult {
  standings: Array<{ playerId: string; placement: number; score?: number }>;
  /** Free-form game summary for the match history ("checkmate in 34"). */
  summary?: string;
  durationSeconds?: number;
}

export type HostToGame =
  | { ns: typeof BRIDGE_NAMESPACE; type: 'init'; payload: BridgeInit }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'pause' }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'resume' }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'mute'; payload: { muted: boolean } }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'theme'; payload: { theme: 'light' | 'dark' } }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'player_joined'; payload: BridgePlayer }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'player_left'; payload: { playerId: string } };

export type GameToHost =
  | { ns: typeof BRIDGE_NAMESPACE; type: 'ready'; payload: { protocol: number; sdk?: string } }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'started' }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'result'; payload: GameResult }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'status'; payload: { text: string } }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'achievement'; payload: { key: string; label: string } }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'invite' }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'haptic'; payload: { style: 'light' | 'medium' | 'heavy' } }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'exit' }
  | { ns: typeof BRIDGE_NAMESPACE; type: 'log'; payload: { level: 'info' | 'warn' | 'error'; message: string } };

export const gameResultSchema = z.object({
  standings: z
    .array(
      z.object({
        playerId: z.string().min(1).max(64),
        placement: z.number().int().min(1).max(16),
        score: z.number().finite().optional(),
      })
    )
    .min(1)
    .max(16),
  summary: z.string().max(200).optional(),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
});

/** Narrows an arbitrary postMessage payload to a bridge message, or null. */
export function parseGameMessage(data: unknown): GameToHost | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as { ns?: unknown; type?: unknown };
  if (msg.ns !== BRIDGE_NAMESPACE || typeof msg.type !== 'string') return null;
  const known = ['ready', 'started', 'result', 'status', 'achievement', 'invite', 'haptic', 'exit', 'log'];
  return known.includes(msg.type) ? (data as GameToHost) : null;
}

/* ───────────────────────── WebRTC signaling (Godot demo-compatible) ───────────────────────── */

/**
 * Message types of Godot's official `webrtc_signaling` demo, which most Godot
 * WebRTC games are built on. The platform's signaling server speaks exactly
 * this so an existing game needs no protocol changes — only the server URL.
 * Frames are JSON: `{ "type": number, "id": number, "data": string }`.
 */
export const SIGNAL = {
  JOIN: 0,
  ID: 1,
  PEER_CONNECT: 2,
  PEER_DISCONNECT: 3,
  OFFER: 4,
  ANSWER: 5,
  CANDIDATE: 6,
  SEAL: 7,
} as const;

export interface SignalFrame {
  type: number;
  id: number;
  data: string;
}

export function parseSignalFrame(raw: string): SignalFrame | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SignalFrame>;
    if (typeof parsed.type !== 'number' || typeof parsed.id !== 'number') return null;
    if (parsed.type < SIGNAL.JOIN || parsed.type > SIGNAL.SEAL) return null;
    return { type: parsed.type, id: parsed.id, data: typeof parsed.data === 'string' ? parsed.data : '' };
  } catch {
    return null;
  }
}

/* ───────────────────────── Ratings ───────────────────────── */

export const DEFAULT_RATING = 1200;
export const RATING_FLOOR = 100;
/** Provisional players move faster until their rating has settled. */
export const PROVISIONAL_GAMES = 10;

export function kFactor(gamesPlayed: number): number {
  if (gamesPlayed < PROVISIONAL_GAMES) return 40;
  return 24;
}

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

export interface RatedPlayer {
  playerId: string;
  rating: number;
  gamesPlayed: number;
  placement: number;
}

/**
 * Multiplayer Elo: every pair of players is scored as one head-to-head game
 * (better placement wins, equal placement draws), and the K-factor is divided
 * by the number of opponents so a four-player game moves a rating about as
 * much as one two-player game. Reduces to standard Elo for two players.
 */
export function rateMatch(players: RatedPlayer[]): Map<string, number> {
  const deltas = new Map<string, number>();
  const opponents = players.length - 1;
  if (opponents < 1) return deltas;

  for (const p of players) {
    let delta = 0;
    const k = kFactor(p.gamesPlayed) / opponents;
    for (const q of players) {
      if (p === q) continue;
      const actual = p.placement < q.placement ? 1 : p.placement === q.placement ? 0.5 : 0;
      delta += k * (actual - expectedScore(p.rating, q.rating));
    }
    deltas.set(p.playerId, Math.round(delta));
  }
  return deltas;
}

export function applyRating(rating: number, delta: number): number {
  return Math.max(RATING_FLOOR, rating + delta);
}

/* ───────────────────────── Result consensus ───────────────────────── */

/**
 * Peer-to-peer games report results from the clients, and any one client can
 * lie. A result is accepted for a rated game only when a strict majority of
 * the seated human players submitted the identical standings; until then it is
 * pending, and a disagreement voids the rating change rather than guessing.
 */
export function standingsKey(result: Pick<GameResult, 'standings'>): string {
  return [...result.standings]
    .sort((a, b) => a.playerId.localeCompare(b.playerId))
    .map((s) => `${s.playerId}:${s.placement}`)
    .join('|');
}

export type ConsensusOutcome =
  | { state: 'pending' }
  | { state: 'accepted'; key: string }
  | { state: 'disputed' };

export function resolveConsensus(reportKeys: string[], seatedHumans: number): ConsensusOutcome {
  if (seatedHumans <= 0) return { state: 'pending' };
  const counts = new Map<string, number>();
  for (const key of reportKeys) counts.set(key, (counts.get(key) ?? 0) + 1);

  const needed = Math.floor(seatedHumans / 2) + 1;
  for (const [key, count] of counts) if (count >= needed) return { state: 'accepted', key };

  // Every human has reported and no version reached a majority.
  if (reportKeys.length >= seatedHumans) return { state: 'disputed' };
  return { state: 'pending' };
}

/** Every seated human must appear exactly once, with placements in range. */
export function validateStandings(result: GameResult, seatIds: string[]): string | null {
  const ids = result.standings.map((s) => s.playerId);
  if (new Set(ids).size !== ids.length) return 'A player appears twice in the standings.';
  const seats = new Set(seatIds);
  if (ids.some((id) => !seats.has(id))) return 'The standings name someone who was not seated.';
  if (ids.length !== seats.size) return 'The standings must include every seated player.';
  if (result.standings.some((s) => s.placement > seats.size)) return 'A placement is out of range.';
  if (!result.standings.some((s) => s.placement === 1)) return 'Someone has to come first.';
  return null;
}

/* ───────────────────────── Tournaments ───────────────────────── */

export const TOURNAMENT_FORMATS = ['single_elimination', 'round_robin'] as const;
export type TournamentFormat = (typeof TOURNAMENT_FORMATS)[number];

export interface BracketMatch {
  round: number;
  /** Position within the round, 0-based. */
  slot: number;
  players: Array<string | null>;
  /** Set for a bye: the player who advances without playing. */
  byeWinner: string | null;
}

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Standard seeding order for a bracket of `size` (a power of two), so that
 * seeds 1 and 2 can only meet in the final: [1, 8, 4, 5, 2, 7, 3, 6] for 8.
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, sum - seed]);
  }
  return order;
}

/**
 * First round of a single-elimination bracket. `seeded` is best-first. Byes go
 * to the top seeds, which is both conventional and the fairest use of them.
 */
export function singleEliminationFirstRound(seeded: string[]): BracketMatch[] {
  const size = Math.max(2, nextPowerOfTwo(seeded.length));
  const order = seedOrder(size);
  const matches: BracketMatch[] = [];

  for (let i = 0; i < size; i += 2) {
    const a = seeded[order[i] - 1] ?? null;
    const b = seeded[order[i + 1] - 1] ?? null;
    const bye = a && !b ? a : !a && b ? b : null;
    matches.push({ round: 1, slot: i / 2, players: [a, b], byeWinner: bye });
  }
  return matches;
}

export function totalRounds(entrants: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, entrants))));
}

/** Pairings for a round robin via the circle method. */
export function roundRobinSchedule(players: string[]): Array<Array<[string, string]>> {
  const list: Array<string | null> = [...players];
  if (list.length % 2 === 1) list.push(null);
  const rounds: Array<Array<[string, string]>> = [];
  const n = list.length;

  for (let r = 0; r < n - 1; r += 1) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push([a, b]);
    }
    rounds.push(pairs);
    // Rotate everyone but the first.
    list.splice(1, 0, list.pop() as string | null);
  }
  return rounds;
}

/** Short, unambiguous room codes: no 0/O, 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function roomCode(random: () => number = Math.random, length = 6): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
