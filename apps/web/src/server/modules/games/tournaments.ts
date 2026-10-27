import { Types } from 'mongoose';
import { roundRobinSchedule, singleEliminationFirstRound, totalRounds } from '@mba/shared/games';
import { topics } from '@mba/shared/realtime';
import type { Actor } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { award } from '@/lib/gamification';
import { notifyMany } from '@/lib/notifications';
import Tournament, { type ITournament, type TournamentMatchDoc } from '@/models/games/Tournament';
import GameRoom from '@/models/games/GameRoom';
import GameRating from '@/models/games/GameRating';
import User from '@/models/User';
import { container } from '../../container';
import { createRoom, type LeanRoom } from './rooms';
import { getGame, isPlayable } from './registry';

export interface CreateTournamentInput {
  gameId: string;
  title: string;
  description?: string;
  format: ITournament['format'];
  maxEntrants: number;
  startsAt: Date;
  matchWindowMinutes: number;
}

type TournamentDoc = InstanceType<typeof Tournament>;

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

async function publish(t: Pick<ITournament, '_id'>) {
  await container().realtime.publish(topics.tournament(String(t._id)), 'tournament.updated', { tournamentId: String(t._id) });
}

export async function createTournament(actor: Actor, input: CreateTournamentInput) {
  const game = await getGame(input.gameId);
  if (!game || !isPlayable(game)) throw ApiError.notFound('That game is not available yet.');
  if (!game.modes.includes('tournament')) throw ApiError.badRequest(`${game.title} does not support tournaments.`);
  if (game.minPlayers > 2) throw ApiError.badRequest('Tournaments are head-to-head; this game needs more players per table.');
  if (input.startsAt.getTime() < Date.now() - 60_000) throw ApiError.unprocessable('Pick a start time in the future.');
  const tournament = await Tournament.create({
    campus: actor.campus,
    game: game.id,
    title: input.title,
    description: input.description ?? '',
    format: input.format,
    maxEntrants: input.format === 'round_robin' ? Math.min(input.maxEntrants, 12) : input.maxEntrants,
    startsAt: input.startsAt,
    matchWindowMinutes: input.matchWindowMinutes,
    createdBy: actor.id,
    entrants: [actor.id],
  });
  return tournament.toObject();
}

export async function loadTournament(id: string, campus: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('That tournament does not exist.');
  const t = await Tournament.findOne({ _id: id, campus });
  if (!t) throw ApiError.notFound('That tournament does not exist.');
  return t;
}

export async function register(t: TournamentDoc, actor: Actor) {
  if (t.status !== 'registration') throw ApiError.conflict('Registration has closed.');
  const updated = await Tournament.findOneAndUpdate(
    { _id: t._id, status: 'registration', entrants: { $ne: oid(actor.id) }, $expr: { $lt: [{ $size: '$entrants' }, '$maxEntrants'] } },
    { $push: { entrants: oid(actor.id) } },
    { new: true }
  ).lean();
  if (!updated) {
    if (t.entrants.some((e) => String(e) === actor.id)) return t.toObject();
    throw ApiError.conflict('The tournament is full.');
  }
  await publish(updated);
  return updated;
}

export async function withdraw(t: TournamentDoc, actor: Actor) {
  if (t.status !== 'registration') throw ApiError.conflict('The tournament has started — forfeit your match instead.');
  const updated = await Tournament.findOneAndUpdate({ _id: t._id, status: 'registration' }, { $pull: { entrants: oid(actor.id) } }, { new: true }).lean();
  if (updated) await publish(updated);
  return updated;
}

export async function cancelTournament(t: TournamentDoc, actor: Actor) {
  if (String(t.createdBy) !== actor.id && !actor.canModerate) throw ApiError.forbidden('Only the organiser can cancel it.');
  if (t.status === 'finished') throw ApiError.conflict('It is already over.');
  t.status = 'cancelled';
  await t.save();
  await GameRoom.updateMany({ tournament: t._id, status: { $in: ['lobby', 'playing'] } }, { $set: { status: 'abandoned' } });
  await notifyMany(
    t.entrants
      .filter((e) => String(e) !== actor.id)
      .map((user) => ({ user, kind: 'tournament_match' as const, title: `${t.title} was cancelled`, href: `/tournaments/${t._id}`, actor: actor.id }))
  );
  await publish(t);
}

/** Seeds by rating, builds the schedule, and opens round one. */
export async function startTournament(t: TournamentDoc, actor: Actor | null) {
  if (actor && String(t.createdBy) !== actor.id && !actor.canModerate) throw ApiError.forbidden('Only the organiser can start it.');
  if (t.status !== 'registration') throw ApiError.conflict('Already started.');
  if (t.entrants.length < 2) throw ApiError.unprocessable('Needs at least two entrants.');

  const ratings = await GameRating.find({ user: { $in: t.entrants }, game: t.game }).select('user rating').lean();
  const ratingOf = new Map(ratings.map((r) => [String(r.user), r.rating]));
  const seeded = t.entrants.map(String).sort((a, b) => (ratingOf.get(b) ?? 1200) - (ratingOf.get(a) ?? 1200));

  const matches: TournamentMatchDoc[] = [];
  if (t.format === 'single_elimination') {
    for (const m of singleEliminationFirstRound(seeded)) {
      matches.push({
        key: `r1-s${m.slot}`,
        round: 1,
        slot: m.slot,
        players: m.players.map((p) => (p ? oid(p) : null)),
        winner: m.byeWinner ? oid(m.byeWinner) : undefined,
        status: m.byeWinner ? 'bye' : 'pending',
      });
    }
    const rounds = totalRounds(seeded.length);
    for (let round = 2; round <= rounds; round += 1) {
      const count = 2 ** (rounds - round);
      for (let slot = 0; slot < count; slot += 1) matches.push({ key: `r${round}-s${slot}`, round, slot, players: [null, null], status: 'pending' });
    }
    // Byes advance straight away.
    for (const m of matches.filter((x) => x.status === 'bye')) placeWinner(matches, m, String(m.winner));
  } else {
    roundRobinSchedule(seeded).forEach((pairs, index) => {
      pairs.forEach(([a, b], slot) => {
        matches.push({ key: `r${index + 1}-${a}-${b}`, round: index + 1, slot, players: [oid(a), oid(b)], status: 'pending' });
      });
    });
  }

  const claimed = await Tournament.findOneAndUpdate(
    { _id: t._id, status: 'registration' },
    {
      $set: {
        status: 'running',
        currentRound: 1,
        matches,
        standings: seeded.map((user) => ({ user: oid(user), points: 0, played: 0 })),
      },
    },
    { new: true }
  );
  if (!claimed) throw ApiError.conflict('Already started.');
  await openRound(claimed, 1);
  return claimed.toObject();
}

function placeWinner(matches: TournamentMatchDoc[], from: TournamentMatchDoc, winnerId: string) {
  const next = matches.find((m) => m.round === from.round + 1 && m.slot === Math.floor(from.slot / 2));
  if (!next) return;
  const players = [...next.players];
  players[from.slot % 2] = oid(winnerId);
  next.players = players;
}

/** Creates a private table for every match in the round that has two players. */
async function openRound(t: TournamentDoc, round: number) {
  const game = await getGame(t.game);
  const deadline = new Date(Date.now() + t.matchWindowMinutes * 60_000);
  const toNotify: Array<{ user: Types.ObjectId; opponent: string; roomId: string }> = [];
  const people = await User.find({ _id: { $in: t.entrants } }).select('name campus').lean();
  const nameOf = new Map(people.map((p) => [String(p._id), p.name]));

  for (const match of t.matches.filter((m) => m.round === round && m.status === 'pending')) {
    const [a, b] = match.players;
    if (!a || !b) {
      // An empty side in a later bracket round means the other side had a bye chain.
      const lone = a ?? b;
      if (lone) {
        match.winner = lone;
        match.status = 'bye';
      }
      continue;
    }
    const host = people.find((p) => String(p._id) === String(a));
    const room = await createRoom(
      { id: String(a), name: nameOf.get(String(a)) ?? 'Player', campus: t.campus } as Actor,
      { gameId: t.game, visibility: 'private', maxPlayers: 2, rated: true },
      {
        mode: 'tournament',
        tournament: t._id,
        tournamentMatch: match.key,
        campus: host?.campus ?? t.campus,
        seats: [
          { seat: 0, user: a, isBot: false, ready: false, present: false, left: false, joinedAt: new Date() },
          { seat: 1, user: b, isBot: false, ready: false, present: false, left: false, joinedAt: new Date() },
        ],
      }
    );
    match.room = room._id;
    match.status = 'ready';
    match.deadline = deadline;
    toNotify.push({ user: a, opponent: nameOf.get(String(b)) ?? 'your opponent', roomId: String(room._id) });
    toNotify.push({ user: b, opponent: nameOf.get(String(a)) ?? 'your opponent', roomId: String(room._id) });
  }
  t.markModified('matches');
  await t.save();

  await notifyMany(
    toNotify.map((n) => ({
      user: n.user,
      kind: 'tournament_match' as const,
      title: `${t.title}: round ${round} vs ${n.opponent}`,
      body: `Your ${game?.title ?? 'game'} table is open. Play within ${t.matchWindowMinutes} minutes or it is forfeited.`,
      href: `/games/room/${n.roomId}`,
      entityType: 'Tournament',
      entity: t._id,
    }))
  );
  await publish(t);
  // A round made entirely of byes completes at once.
  await maybeAdvance(t._id);
}

/** Records a match winner (or round-robin placements) and moves the event on. */
async function resolveMatch(tournamentId: Types.ObjectId, key: string, placements: Array<{ user: string; placement: number }>) {
  const t = await Tournament.findById(tournamentId);
  if (!t || t.status !== 'running') return;
  const match = t.matches.find((m) => m.key === key);
  if (!match || match.status === 'done' || match.status === 'bye') return;

  const sorted = [...placements].sort((x, y) => x.placement - y.placement);
  // A bracket cannot draw: the higher seed (listed first) goes through on a tie.
  const tiedAtTop = sorted.filter((p) => p.placement === sorted[0].placement).map((p) => p.user);
  const winner = tiedAtTop.length > 1 ? String(match.players.find((p) => p && tiedAtTop.includes(String(p)))) : sorted[0].user;

  const update: Record<string, unknown> = {
    'matches.$[m].status': 'done',
    'matches.$[m].winner': oid(winner),
    'matches.$[m].placements': placements.map((p) => ({ user: oid(p.user), placement: p.placement })),
  };
  const claimed = await Tournament.findOneAndUpdate(
    { _id: t._id, matches: { $elemMatch: { key, status: { $in: ['pending', 'ready', 'playing'] } } } },
    { $set: update },
    { arrayFilters: [{ 'm.key': key }], new: true }
  );
  if (!claimed) return;

  if (claimed.format === 'single_elimination') {
    const m = claimed.matches.find((x) => x.key === key)!;
    const next = claimed.matches.find((x) => x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2));
    if (next) {
      await Tournament.updateOne(
        { _id: claimed._id },
        { $set: { [`matches.$[n].players.${m.slot % 2}`]: oid(winner) } },
        { arrayFilters: [{ 'n.key': next.key }] }
      );
    }
  } else {
    const draw = tiedAtTop.length > 1;
    for (const p of placements) {
      const points = draw && tiedAtTop.includes(p.user) ? 0.5 : p.user === winner ? 1 : 0;
      await Tournament.updateOne({ _id: claimed._id, 'standings.user': oid(p.user) }, { $inc: { 'standings.$.points': points, 'standings.$.played': 1 } });
    }
  }
  await publish(claimed);
  await maybeAdvance(claimed._id);
}

/** When the current round is complete, either finish or open the next one — exactly once. */
async function maybeAdvance(tournamentId: Types.ObjectId) {
  const t = await Tournament.findById(tournamentId);
  if (!t || t.status !== 'running') return;
  const round = t.currentRound;
  const current = t.matches.filter((m) => m.round === round);
  if (current.some((m) => m.status !== 'done' && m.status !== 'bye')) return;
  const lastRound = Math.max(...t.matches.map((m) => m.round));

  if (round >= lastRound) {
    let winner: Types.ObjectId | undefined;
    if (t.format === 'single_elimination') winner = (t.matches.find((m) => m.round === lastRound)?.winner ?? undefined) as Types.ObjectId | undefined;
    else winner = [...t.standings].sort((a, b) => b.points - a.points)[0]?.user;
    const finished = await Tournament.findOneAndUpdate({ _id: t._id, status: 'running', currentRound: round }, { $set: { status: 'finished', winner } }, { new: true });
    if (!finished) return;
    if (winner) await award(String(winner), 'tournament_won', { entityType: 'Tournament', entity: t._id });
    const winnerName = winner ? (await User.findById(winner).select('name').lean())?.name : null;
    await notifyMany(
      t.entrants.map((user) => ({
        user,
        kind: 'tournament_match' as const,
        title: winner && String(winner) === String(user) ? `You won ${t.title}! 🏆` : `${t.title} is over`,
        body: winnerName ? `Champion: ${winnerName}` : undefined,
        href: `/tournaments/${t._id}`,
        entityType: 'Tournament',
        entity: t._id,
      }))
    );
    await publish(finished);
    return;
  }

  const advanced = await Tournament.findOneAndUpdate({ _id: t._id, status: 'running', currentRound: round }, { $set: { currentRound: round + 1 } }, { new: true });
  if (advanced) await openRound(advanced, round + 1);
}

/** Room → tournament: called once when a tournament table finishes. */
export async function onTournamentRoomFinished(room: LeanRoom) {
  if (!room.tournament || !room.tournamentMatch || !room.result) return;
  await resolveMatch(
    room.tournament,
    room.tournamentMatch,
    room.result.standings.filter((s) => !s.playerId.startsWith('bot-')).map((s) => ({ user: s.playerId, placement: s.placement }))
  );
}

/**
 * Maintenance: starts tournaments whose time has come and forfeits matches
 * nobody played inside the window. A no-show loses to whoever turned up; if
 * neither did, the higher seed goes through.
 */
export async function sweepTournaments(now = new Date()) {
  let started = 0;
  let forfeited = 0;
  const due = await Tournament.find({ status: 'registration', startsAt: { $lte: now } }).limit(50);
  for (const t of due) {
    if (t.entrants.length < 2) {
      t.status = 'cancelled';
      await t.save();
      continue;
    }
    await startTournament(t, null).catch((error) => console.error('[tournaments] auto-start failed:', error));
    started += 1;
  }

  const running = await Tournament.find({ status: 'running', matches: { $elemMatch: { status: 'ready', deadline: { $lte: now } } } }).limit(50);
  for (const t of running) {
    for (const match of t.matches.filter((m) => m.status === 'ready' && m.deadline && m.deadline <= now)) {
      const room = match.room ? await GameRoom.findById(match.room).lean() : null;
      if (room?.status === 'playing') continue; // In progress: let it finish.
      if (room?.status === 'finished') continue; // Result is on its way through onTournamentRoomFinished.
      const showed = room?.seats.filter((s) => s.present || s.ready).map((s) => String(s.user)) ?? [];
      const players = match.players.filter(Boolean).map(String);
      const winner = showed.length === 1 ? showed[0] : players[0];
      if (room) await GameRoom.updateOne({ _id: room._id }, { $set: { status: 'abandoned' } });
      await resolveMatch(t._id, match.key, players.map((p) => ({ user: p, placement: p === winner ? 1 : 2 })));
      forfeited += 1;
    }
  }
  return { started, forfeited };
}

export async function tournamentView(t: ITournament, viewerId: string) {
  const ids = [...new Set([...t.entrants.map(String), ...t.matches.flatMap((m) => m.players.filter(Boolean).map(String))])];
  const [people, ratings] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('name image').lean(),
    GameRating.find({ user: { $in: ids }, game: t.game }).select('user rating').lean(),
  ]);
  const person = new Map(people.map((p) => [String(p._id), { _id: String(p._id), name: p.name, image: p.image ?? '' }]));
  const ratingOf = new Map(ratings.map((r) => [String(r.user), r.rating]));
  const ref = (id: unknown) => (id ? { ...(person.get(String(id)) ?? { _id: String(id), name: 'Player', image: '' }), rating: ratingOf.get(String(id)) ?? null } : null);
  return {
    _id: String(t._id),
    game: t.game,
    title: t.title,
    description: t.description,
    format: t.format,
    status: t.status,
    startsAt: t.startsAt,
    maxEntrants: t.maxEntrants,
    matchWindowMinutes: t.matchWindowMinutes,
    currentRound: t.currentRound,
    createdBy: String(t.createdBy),
    entrants: t.entrants.map(ref),
    registered: t.entrants.some((e) => String(e) === viewerId),
    matches: t.matches.map((m) => ({
      key: m.key,
      round: m.round,
      slot: m.slot,
      players: m.players.map(ref),
      winner: m.winner ? String(m.winner) : null,
      status: m.status,
      room: m.room ? String(m.room) : null,
      deadline: m.deadline,
      mine: m.players.some((p) => p && String(p) === viewerId),
    })),
    standings: [...t.standings].sort((a, b) => b.points - a.points).map((s) => ({ player: ref(s.user), points: s.points, played: s.played })),
    winner: ref(t.winner),
  };
}
