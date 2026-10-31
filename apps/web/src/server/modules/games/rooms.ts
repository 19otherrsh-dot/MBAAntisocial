import { Types } from 'mongoose';
import {
  BRIDGE_PROTOCOL_VERSION,
  ROOM_CODE_PATTERN,
  roomCode,
  type BridgeInit,
  type BridgePlayer,
  type GameManifest,
} from '@mba/shared/games';
import { topics } from '@mba/shared/realtime';
import type { Actor } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { env } from '@/lib/env';
import { notifyMany } from '@/lib/notifications';
import GameRoom, { type IGameRoom } from '@/models/games/GameRoom';
import GameRating from '@/models/games/GameRating';
import User from '@/models/User';
import { container } from '../../container';
import { mintGameTicket } from '../realtime/tokens';
import { getGame, isPlayable } from './registry';

export type LeanRoom = IGameRoom;

const PEOPLE = 'name image';
const LIVE: IGameRoom['status'][] = ['lobby', 'playing'];
const MAX_OPTIONS = 12;

/* ───────────────────────── Views ───────────────────────── */

export interface RoomView {
  _id: string;
  game: string;
  code: string;
  host: string;
  status: IGameRoom['status'];
  mode: IGameRoom['mode'];
  visibility: IGameRoom['visibility'];
  crossCampus: boolean;
  campus: string;
  maxPlayers: number;
  minPlayers: number;
  rated: boolean;
  options: IGameRoom['options'];
  seats: Array<{ seat: number; user: { _id: string; name: string; image: string; rating: number | null } | null; isBot: boolean; ready: boolean; present: boolean; left: boolean }>;
  spectatorCount: number;
  tournament?: string;
  rematch?: string;
  result?: IGameRoom['result'];
  disputed: boolean;
  startedAt?: Date;
  finishedAt?: Date;
}

/** One shape for every viewer, so it can be broadcast as-is. */
export async function viewRoom(room: LeanRoom): Promise<RoomView> {
  const ids = room.seats.filter((s) => s.user).map((s) => s.user!);
  const [users, ratings] = await Promise.all([
    User.find({ _id: { $in: ids } }).select(PEOPLE).lean(),
    room.rated ? GameRating.find({ user: { $in: ids }, game: room.game }).select('user rating').lean() : Promise.resolve([]),
  ]);
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const ratingOf = new Map(ratings.map((r) => [String(r.user), r.rating]));
  return {
    _id: String(room._id),
    game: room.game,
    code: room.code,
    host: String(room.host),
    status: room.status,
    mode: room.mode,
    visibility: room.visibility,
    crossCampus: room.crossCampus,
    campus: room.campus,
    maxPlayers: room.maxPlayers,
    minPlayers: room.minPlayers,
    rated: room.rated,
    options: room.options ?? {},
    seats: [...room.seats]
      .sort((a, b) => a.seat - b.seat)
      .map((s) => {
        const u = s.user ? byId.get(String(s.user)) : undefined;
        return {
          seat: s.seat,
          user: u ? { _id: String(u._id), name: u.name, image: u.image ?? '', rating: ratingOf.get(String(u._id)) ?? null } : null,
          isBot: s.isBot,
          ready: s.ready,
          present: s.present,
          left: s.left,
        };
      }),
    spectatorCount: room.spectators.length,
    tournament: room.tournament ? String(room.tournament) : undefined,
    rematch: room.rematch ? String(room.rematch) : undefined,
    result: room.result,
    disputed: room.disputed,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
  };
}

export async function broadcastRoom(room: LeanRoom) {
  const view = await viewRoom(room);
  await container().realtime.publish(topics.gameRoom(String(room._id)), 'game.room.updated', { roomId: String(room._id), room: view });
  return view;
}

/* ───────────────────────── Lookups ───────────────────────── */

export function seatOf(room: Pick<LeanRoom, 'seats'>, userId: string) {
  return room.seats.find((s) => s.user && String(s.user) === userId) ?? null;
}

export function humanSeats(room: Pick<LeanRoom, 'seats'>) {
  return room.seats.filter((s) => !s.isBot && s.user);
}

function canSeeRoom(room: LeanRoom, actor: Pick<Actor, 'id' | 'campus'>): boolean {
  if (seatOf(room, actor.id) || room.spectators.some((s) => String(s) === actor.id)) return true;
  return room.campus === actor.campus || room.crossCampus;
}

export async function loadRoom(roomId: string, actor: Pick<Actor, 'id' | 'campus'>): Promise<LeanRoom> {
  if (!Types.ObjectId.isValid(roomId)) throw ApiError.notFound('That table does not exist.');
  const room = await GameRoom.findById(roomId).lean();
  // Private rooms are reachable by id once you have the link or code, like any invite.
  if (!room || !canSeeRoom(room, actor)) throw ApiError.notFound('That table does not exist.');
  return room;
}

export async function roomByCode(code: string, actor: Pick<Actor, 'id' | 'campus'>): Promise<LeanRoom> {
  const normalised = code.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(normalised)) throw ApiError.badRequest('Room codes are six letters and numbers.');
  const room = await GameRoom.findOne({ code: normalised, status: { $in: LIVE } }).lean();
  if (!room || !canSeeRoom(room, actor)) throw ApiError.notFound('No open table with that code.');
  return room;
}

async function requireOnlineGame(gameId: string): Promise<GameManifest & { network: { transport: 'webrtc' | 'relay' | 'dedicated' } }> {
  const game = await getGame(gameId);
  if (!game) throw ApiError.notFound('That game does not exist.');
  if (!isPlayable(game)) throw ApiError.conflict(`${game.title} is coming soon — the build has not been published yet.`);
  if (!game.modes.includes('online') && !game.modes.includes('tournament')) throw ApiError.badRequest(`${game.title} has no online mode.`);
  if (game.network.transport === 'none') throw ApiError.badRequest(`${game.title} is single-device only.`);
  return game as GameManifest & { network: { transport: 'webrtc' | 'relay' | 'dedicated' } };
}

/* ───────────────────────── Lifecycle ───────────────────────── */

export interface CreateRoomInput {
  gameId: string;
  visibility: 'public' | 'private';
  crossCampus?: boolean;
  options?: Record<string, string | number | boolean>;
  maxPlayers?: number;
  rated?: boolean;
}

/**
 * Leaves any casual lobby the player is sitting in, so one person holds one
 * seat. Tournament tables are left alone: the bracket seats people there, and
 * a pending match must not stop anyone playing a casual game meanwhile.
 */
async function vacateOtherLobbies(userId: string, exceptRoomId?: string) {
  const lobbies = await GameRoom.find({ 'seats.user': userId, status: 'lobby', mode: { $ne: 'tournament' }, ...(exceptRoomId ? { _id: { $ne: exceptRoomId } } : {}) }).lean();
  for (const lobby of lobbies) await leaveRoom(lobby, userId);
}

export async function createRoom(actor: Actor, input: CreateRoomInput, extra: Partial<IGameRoom> = {}): Promise<LeanRoom> {
  const game = await requireOnlineGame(input.gameId);
  if (input.options && Object.keys(input.options).length > MAX_OPTIONS) throw ApiError.badRequest('Too many table options.');
  const maxPlayers = Math.min(game.maxPlayers, Math.max(game.minPlayers, input.maxPlayers ?? game.maxPlayers));
  if (!extra.tournament) await vacateOtherLobbies(actor.id);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const room = await GameRoom.create({
        campus: actor.campus,
        game: game.id,
        version: game.build?.version ?? '',
        code: roomCode(),
        host: actor.id,
        transport: game.network.transport,
        visibility: input.visibility,
        crossCampus: input.visibility === 'public' && Boolean(input.crossCampus),
        maxPlayers,
        minPlayers: game.minPlayers,
        rated: game.rated && input.rated !== false,
        seats: extra.seats ?? [{ seat: 0, user: actor.id, isBot: false, ready: false, present: false, left: false, joinedAt: new Date() }],
        options: input.options ?? {},
        ...extra,
      });
      return room.toObject();
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      // Code collision among live rooms: draw another.
    }
  }
  throw ApiError.internal('Could not allocate a room code. Try again.');
}

function freeSeat(room: Pick<LeanRoom, 'seats' | 'maxPlayers'>): number | null {
  const taken = new Set(room.seats.map((s) => s.seat));
  for (let i = 0; i < room.maxPlayers; i += 1) if (!taken.has(i)) return i;
  return null;
}

/** Takes a free seat, atomically: two people racing for the last seat cannot both get it. */
export async function joinRoom(room: LeanRoom, actor: Actor): Promise<LeanRoom> {
  if (seatOf(room, actor.id)) return room;
  if (room.mode === 'tournament') throw ApiError.forbidden('Tournament tables are seated by the bracket.');
  if (room.status !== 'lobby') throw ApiError.conflict('That game has already started. You can watch instead.');
  if (room.campus !== actor.campus && !room.crossCampus) throw ApiError.forbidden('That table is for its own campus.');
  await vacateOtherLobbies(actor.id, String(room._id));

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = attempt === 0 ? room : await GameRoom.findById(room._id).lean();
    if (!current || current.status !== 'lobby') throw ApiError.conflict('That table is no longer open.');
    const seat = freeSeat(current);
    if (seat === null) throw ApiError.conflict('That table is full.');
    const updated = await GameRoom.findOneAndUpdate(
      { _id: room._id, status: 'lobby', 'seats.seat': { $ne: seat }, 'seats.user': { $ne: actor.id } },
      {
        $push: { seats: { seat, user: actor.id, isBot: false, ready: false, present: false, left: false, joinedAt: new Date() } },
        $pull: { spectators: actor.id },
        $set: { lastActivityAt: new Date() },
      },
      { new: true }
    ).lean();
    if (updated) {
      await broadcastRoom(updated);
      return updated;
    }
  }
  throw ApiError.conflict('Someone took that seat first. Try again.');
}

export async function spectateRoom(room: LeanRoom, actor: Actor): Promise<LeanRoom> {
  const game = await getGame(room.game);
  if (!game?.network.spectators) throw ApiError.forbidden('This game does not allow spectators.');
  if (seatOf(room, actor.id)) return room;
  const updated = await GameRoom.findOneAndUpdate({ _id: room._id }, { $addToSet: { spectators: actor.id } }, { new: true }).lean();
  return updated!;
}

/**
 * Leaving a lobby frees the seat (and hands the host role on). Leaving a game
 * in progress is a resignation: the seat stays, marked as left, and if only one
 * player is left standing the game ends in their favour.
 */
export async function leaveRoom(room: LeanRoom, userId: string): Promise<LeanRoom | null> {
  if (room.spectators.some((s) => String(s) === userId)) {
    return GameRoom.findByIdAndUpdate(room._id, { $pull: { spectators: userId } }, { new: true }).lean();
  }
  const seat = seatOf(room, userId);
  if (!seat) return room;

  if (room.status === 'lobby') {
    if (room.mode === 'tournament') throw ApiError.badRequest('Withdraw from the tournament instead.');
    const remaining = humanSeats(room).filter((s) => String(s.user) !== userId);
    if (remaining.length === 0) {
      const closed = await GameRoom.findByIdAndUpdate(room._id, { $set: { status: 'abandoned', seats: [] } }, { new: true }).lean();
      if (closed) await broadcastRoom(closed);
      return closed;
    }
    const nextHost = String(room.host) === userId ? remaining.sort((a, b) => a.seat - b.seat)[0].user : room.host;
    const updated = await GameRoom.findByIdAndUpdate(
      room._id,
      { $pull: { seats: { user: new Types.ObjectId(userId) } }, $set: { host: nextHost, lastActivityAt: new Date() } },
      { new: true }
    ).lean();
    if (updated) await broadcastRoom(updated);
    return updated;
  }

  if (room.status === 'playing') {
    const updated = await GameRoom.findOneAndUpdate(
      { _id: room._id, 'seats.user': userId },
      { $set: { 'seats.$.left': true, 'seats.$.present': false, lastActivityAt: new Date() } },
      { new: true }
    ).lean();
    if (!updated) return null;
    const standing = humanSeats(updated).filter((s) => !s.left);
    if (standing.length <= 1 && !updated.seats.some((s) => s.isBot)) {
      const { finishByForfeit } = await import('./results');
      return finishByForfeit(updated);
    }
    await broadcastRoom(updated);
    return updated;
  }
  return room;
}

export async function setReady(room: LeanRoom, userId: string, ready: boolean): Promise<LeanRoom> {
  if (room.status !== 'lobby') throw ApiError.conflict('The game has already started.');
  const updated = await GameRoom.findOneAndUpdate(
    { _id: room._id, 'seats.user': userId },
    { $set: { 'seats.$.ready': ready, lastActivityAt: new Date() } },
    { new: true }
  ).lean();
  if (!updated) throw ApiError.forbidden('Take a seat first.');
  await broadcastRoom(updated);
  return updated;
}

function requireHost(room: LeanRoom, userId: string) {
  if (String(room.host) !== userId) throw ApiError.forbidden('Only the host can do that.');
}

export async function kickFromRoom(room: LeanRoom, hostId: string, targetId: string): Promise<LeanRoom> {
  requireHost(room, hostId);
  if (room.status !== 'lobby') throw ApiError.conflict('You can only remove people before the game starts.');
  if (targetId === hostId) throw ApiError.badRequest('Leave the table instead.');
  const updated = await GameRoom.findByIdAndUpdate(room._id, { $pull: { seats: { user: new Types.ObjectId(targetId) } } }, { new: true }).lean();
  await broadcastRoom(updated!);
  return updated!;
}

export async function addBot(room: LeanRoom, hostId: string): Promise<LeanRoom> {
  requireHost(room, hostId);
  const game = await getGame(room.game);
  if (!game?.network.botBackfill) throw ApiError.badRequest('This game cannot seat bots in online tables.');
  if (room.status !== 'lobby') throw ApiError.conflict('The game has already started.');
  const seat = freeSeat(room);
  if (seat === null) throw ApiError.conflict('The table is full.');
  const updated = await GameRoom.findOneAndUpdate(
    { _id: room._id, 'seats.seat': { $ne: seat } },
    // Bots never count toward ratings; a table with one makes the game unrated.
    { $push: { seats: { seat, isBot: true, ready: true, present: true, left: false, joinedAt: new Date() } }, $set: { rated: false } },
    { new: true }
  ).lean();
  if (!updated) throw ApiError.conflict('That seat was just taken.');
  await broadcastRoom(updated);
  return updated;
}

export async function removeBot(room: LeanRoom, hostId: string, seat: number): Promise<LeanRoom> {
  requireHost(room, hostId);
  const updated = await GameRoom.findByIdAndUpdate(room._id, { $pull: { seats: { seat, isBot: true } } }, { new: true }).lean();
  await broadcastRoom(updated!);
  return updated!;
}

export async function updateOptions(room: LeanRoom, hostId: string, options: Record<string, string | number | boolean>, visibility?: 'public' | 'private') {
  requireHost(room, hostId);
  if (room.status !== 'lobby') throw ApiError.conflict('The game has already started.');
  if (Object.keys(options).length > MAX_OPTIONS) throw ApiError.badRequest('Too many table options.');
  const updated = await GameRoom.findByIdAndUpdate(
    room._id,
    { $set: { options, ...(visibility ? { visibility } : {}), lastActivityAt: new Date() } },
    { new: true }
  ).lean();
  await broadcastRoom(updated!);
  return updated!;
}

/** Host starts once enough players are seated and every human is ready. */
export async function startRoom(room: LeanRoom, hostId: string): Promise<LeanRoom> {
  requireHost(room, hostId);
  if (room.status !== 'lobby') throw ApiError.conflict('The game has already started.');
  if (room.seats.length < room.minPlayers) throw ApiError.unprocessable(`Needs at least ${room.minPlayers} players.`);
  const notReady = humanSeats(room).filter((s) => !s.ready && String(s.user) !== hostId);
  if (notReady.length > 0) throw ApiError.unprocessable('Everyone has to be ready first.');

  const updated = await GameRoom.findOneAndUpdate(
    { _id: room._id, status: 'lobby' },
    // The host starting is the host being ready. Tables with fewer than two humans are never rated.
    { $set: { status: 'playing', startedAt: new Date(), lastActivityAt: new Date(), 'seats.$[].ready': true, ...(humanSeats(room).length < 2 ? { rated: false } : {}) } },
    { new: true }
  ).lean();
  if (!updated) throw ApiError.conflict('The game has already started.');
  await broadcastRoom(updated);
  await container().realtime.publish(topics.gameRoom(String(room._id)), 'game.room.started', { roomId: String(room._id) });
  return updated;
}

/** Invites by notification. Anyone on campus can be invited to a table — it is a game, not a DM. */
export async function inviteToRoom(room: LeanRoom, actor: Actor, userIds: string[]) {
  if (!seatOf(room, actor.id)) throw ApiError.forbidden('Sit at the table to invite people.');
  if (room.status !== 'lobby') throw ApiError.conflict('The game has already started.');
  const game = await getGame(room.game);
  const users = await User.find({ _id: { $in: userIds.slice(0, 10) }, campus: actor.campus }).select('_id').lean();
  const href = `/games/room/${room._id}`;
  await notifyMany(
    users.map((u) => ({
      user: u._id,
      kind: 'game_invite' as const,
      title: `${actor.name} invited you to ${game?.title ?? 'a game'}`,
      body: `Table code ${room.code}`,
      href,
      actor: actor.id,
      entityType: 'GameRoom',
      entity: room._id,
    }))
  );
  await Promise.all(
    users.map((u) =>
      container().realtime.publish(topics.user(String(u._id)), 'game.invite', {
        roomId: String(room._id),
        code: room.code,
        gameId: room.game,
        gameTitle: game?.title ?? room.game,
        from: actor.name,
      })
    )
  );
  return users.length;
}

/**
 * "Play again" after a finished online game. The first player to press it
 * opens a private lobby with the same game, size and options (and the same
 * bots); the finished room then points at it, so everyone else who presses it
 * sits down at that table instead of opening their own. The other players are
 * invited. Tournament matches continue in their bracket instead.
 */
export async function rematchRoom(room: LeanRoom, actor: Actor): Promise<LeanRoom> {
  if (room.mode === 'tournament') throw ApiError.forbidden('Tournament matches continue in the bracket.');
  if (room.status !== 'finished' && room.status !== 'abandoned') throw ApiError.conflict('That game is still going.');
  if (!seatOf(room, actor.id)) throw ApiError.forbidden('Only the players can ask for a rematch.');

  if (room.rematch) {
    const existing = await GameRoom.findById(room.rematch).lean();
    if (existing?.status === 'lobby') return joinRoom(existing, actor);
  }

  const created = await createRoom(
    actor,
    { gameId: room.game, visibility: 'private', maxPlayers: room.maxPlayers, rated: room.rated, options: room.options },
    { crossCampus: room.crossCampus }
  );
  // Claim the finished room's pointer; if another player won the race, use their table.
  const claimed = await GameRoom.findOneAndUpdate(
    { _id: room._id, rematch: room.rematch ?? null },
    { $set: { rematch: created._id } },
    { new: true }
  ).lean();
  if (!claimed) {
    await GameRoom.deleteOne({ _id: created._id });
    const winner = await GameRoom.findById((await GameRoom.findById(room._id).select('rematch').lean())?.rematch).lean();
    if (!winner) throw ApiError.conflict('That rematch is no longer open.');
    return joinRoom(winner, actor);
  }

  let next = created;
  const bots = room.seats.filter((s) => s.isBot).length;
  for (let i = 0; i < bots; i += 1) next = await addBot(next, actor.id);
  const others = humanSeats(room)
    .map((s) => String(s.user))
    .filter((id) => id !== actor.id);
  if (others.length) await inviteToRoom(next, actor, others);
  await container().realtime.publish(topics.gameRoom(String(room._id)), 'game.room.rematch', {
    roomId: String(room._id),
    rematchId: String(next._id),
    from: actor.name,
  });
  return next;
}

/**
 * Quick match: the open public table on campus with the closest average
 * rating, then cross-campus tables, then a fresh table others can find.
 */
export async function quickMatch(actor: Actor, gameId: string): Promise<LeanRoom> {
  const game = await requireOnlineGame(gameId);
  const mine = await GameRating.findOne({ user: actor.id, game: gameId }).select('rating').lean();
  const myRating = mine?.rating ?? 1200;

  const candidates = await GameRoom.find({
    game: gameId,
    status: 'lobby',
    visibility: 'public',
    mode: 'online',
    'seats.user': { $ne: actor.id },
    $or: [{ campus: actor.campus }, { crossCampus: true }],
    $expr: { $lt: [{ $size: '$seats' }, '$maxPlayers'] },
    lastActivityAt: { $gte: new Date(Date.now() - 20 * 60_000) },
  })
    .limit(30)
    .lean();

  if (candidates.length > 0) {
    const ids = candidates.flatMap((r) => r.seats.filter((s) => s.user).map((s) => s.user!));
    const ratings = await GameRating.find({ user: { $in: ids }, game: gameId }).select('user rating').lean();
    const ratingOf = new Map(ratings.map((r) => [String(r.user), r.rating]));
    const score = (r: LeanRoom) => {
      const seated = humanSeats(r).map((s) => ratingOf.get(String(s.user)) ?? 1200);
      const avg = seated.length ? seated.reduce((a, b) => a + b, 0) / seated.length : 1200;
      return Math.abs(avg - myRating) + (r.campus === actor.campus ? 0 : 150);
    };
    for (const room of candidates.sort((a, b) => score(a) - score(b))) {
      try {
        return await joinRoom(room, actor);
      } catch {
        // Filled or started meanwhile — next.
      }
    }
  }
  return createRoom(actor, { gameId: game.id, visibility: 'public', crossCampus: true });
}

/* ───────────────────────── Player session ───────────────────────── */

function iceServers(): BridgeInit['network']['iceServers'] {
  if (env.GAME_ICE_SERVERS) {
    try {
      const parsed = JSON.parse(env.GAME_ICE_SERVERS);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      console.error('[games] GAME_ICE_SERVERS is not valid JSON; using public STUN.');
    }
  }
  return [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
}

const TRANSPORT_PATH = { webrtc: '/games/signal', relay: '/games/relay', dedicated: '/games/dedicated' } as const;

function realtimeGameUrl(transport: keyof typeof TRANSPORT_PATH): string | null {
  if (!env.NEXT_PUBLIC_REALTIME_URL) return null;
  const url = new URL(TRANSPORT_PATH[transport], env.NEXT_PUBLIC_REALTIME_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function peerIdForSeat(seat: number, isHost: boolean): number {
  return isHost ? 1 : seat + 2;
}

/**
 * Everything the game build needs to start: who it is, who else is at the
 * table, and a short-lived ticket for the network. Seated players and
 * spectators get tickets; anyone else gets nothing.
 */
export async function bridgeInitForRoom(room: LeanRoom, actor: Actor, environment: BridgeInit['environment']): Promise<BridgeInit> {
  const game = await getGame(room.game);
  if (!game) throw ApiError.notFound('That game does not exist.');
  const seat = seatOf(room, actor.id);
  const spectating = !seat;
  if (spectating && !room.spectators.some((s) => String(s) === actor.id)) throw ApiError.forbidden('Join or watch the table first.');
  if (room.status === 'finished' || room.status === 'abandoned') throw ApiError.conflict('That game is over.');

  const view = await viewRoom(room);
  const players: BridgePlayer[] = view.seats.map((s) => ({
    id: s.user?._id ?? `bot-${s.seat}`,
    name: s.user?.name ?? `Bot ${s.seat + 1}`,
    avatar: s.user?.image ?? '',
    rating: s.user?.rating ?? null,
    seat: s.seat,
    isBot: s.isBot,
  }));
  const me = players.find((p) => p.id === actor.id) ?? { id: actor.id, name: actor.name, avatar: '', rating: null, seat: null };
  const isHost = String(room.host) === actor.id;
  const url = realtimeGameUrl(room.transport);
  const ticket = url
    ? await mintGameTicket({ sub: actor.id, name: actor.name, room: String(room._id), game: room.game, seat: seat?.seat ?? -1, host: isHost && !spectating, transport: room.transport })
    : null;

  return {
    protocol: BRIDGE_PROTOCOL_VERSION,
    gameId: room.game,
    mode: room.mode,
    player: me,
    room: {
      id: String(room._id),
      code: room.code,
      hostId: String(room.host),
      players,
      spectating,
      tournamentMatchId: room.tournamentMatch ?? null,
      options: room.options ?? {},
    },
    network: {
      transport: room.transport,
      url,
      ticket,
      iceServers: room.transport === 'webrtc' ? iceServers() : [],
      expectedPeerId: room.transport === 'webrtc' && seat ? peerIdForSeat(seat.seat, isHost) : null,
    },
    bot: null,
    environment,
  };
}

export async function setPresence(roomId: string, userId: string, present: boolean) {
  const updated = await GameRoom.findOneAndUpdate(
    { _id: roomId, 'seats.user': userId },
    { $set: { 'seats.$.present': present, lastActivityAt: new Date() } },
    { new: true }
  ).lean();
  if (updated) await broadcastRoom(updated);
}

/** Live tables a user sits at, for "continue playing". */
export async function liveRoomsFor(userId: string) {
  return GameRoom.find({ 'seats.user': userId, status: { $in: LIVE } }).sort({ lastActivityAt: -1 }).limit(10).lean();
}
