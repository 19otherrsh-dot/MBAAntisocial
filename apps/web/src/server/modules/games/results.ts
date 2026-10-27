import { Types } from 'mongoose';
import {
  applyRating,
  rateMatch,
  resolveConsensus,
  standingsKey,
  validateStandings,
  type GameResult,
} from '@mba/shared/games';
import { topics } from '@mba/shared/realtime';
import type { Actor } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { award } from '@/lib/gamification';
import GameRoom, { type IGameRoom } from '@/models/games/GameRoom';
import GameRating from '@/models/games/GameRating';
import GameMatch from '@/models/games/GameMatch';
import { container } from '../../container';
import { broadcastRoom, humanSeats, seatOf, type LeanRoom } from './rooms';
import { getGame, isPlayable } from './registry';

/** How long a partial set of reports waits for the rest before being settled. */
export const REPORT_GRACE_MS = 10 * 60_000;

function seatIds(room: LeanRoom): string[] {
  return room.seats.map((s) => (s.user ? String(s.user) : `bot-${s.seat}`));
}

function outcome(placement: number, standings: GameResult['standings']): 'win' | 'draw' | 'loss' {
  if (placement !== 1) return 'loss';
  return standings.filter((s) => s.placement === 1).length > 1 ? 'draw' : 'win';
}

/**
 * Ends a game exactly once. The status flip is the lock: whichever caller
 * moves the room from `playing` to `finished` does the bookkeeping, every
 * later caller sees nothing to do.
 */
export async function finalize(
  room: LeanRoom,
  result: GameResult,
  source: NonNullable<IGameRoom['result']>['source'],
  options: { rated?: boolean; disputed?: boolean } = {}
): Promise<LeanRoom> {
  const rated = (options.rated ?? room.rated) && !room.seats.some((s) => s.isBot) && humanSeats(room).length >= 2;
  const finished = await GameRoom.findOneAndUpdate(
    { _id: room._id, status: 'playing' },
    {
      $set: {
        status: 'finished',
        finishedAt: new Date(),
        rated,
        disputed: Boolean(options.disputed),
        result: { standings: result.standings, summary: result.summary ?? '', durationSeconds: result.durationSeconds, source },
      },
    },
    { new: true }
  ).lean();
  if (!finished) return (await GameRoom.findById(room._id).lean()) ?? room;

  const placementOf = new Map(result.standings.map((s) => [s.playerId, s]));
  const humans = humanSeats(finished);
  const humanIds = humans.map((s) => String(s.user));

  // Ratings.
  const before = new Map<string, number>();
  const after = new Map<string, number>();
  if (rated) {
    const existing = await GameRating.find({ user: { $in: humanIds }, game: finished.game }).lean();
    const byUser = new Map(existing.map((r) => [String(r.user), r]));
    const deltas = rateMatch(
      humanIds.map((id) => ({
        playerId: id,
        rating: byUser.get(id)?.rating ?? 1200,
        gamesPlayed: byUser.get(id)?.gamesPlayed ?? 0,
        placement: placementOf.get(id)?.placement ?? humanIds.length,
      }))
    );
    for (const id of humanIds) {
      const current = byUser.get(id)?.rating ?? 1200;
      const next = applyRating(current, deltas.get(id) ?? 0);
      before.set(id, current);
      after.set(id, next);
    }
  }

  await Promise.all(
    humanIds.map(async (id) => {
      const placement = placementOf.get(id)?.placement ?? humanIds.length;
      const result_ = outcome(placement, result.standings);
      const set: Record<string, unknown> = { campus: finished.campus, lastPlayedAt: new Date() };
      if (rated) set.rating = after.get(id);
      await GameRating.updateOne(
        { user: id, game: finished.game },
        {
          $set: set,
          $inc: { gamesPlayed: 1, wins: result_ === 'win' ? 1 : 0, losses: result_ === 'loss' ? 1 : 0, draws: result_ === 'draw' ? 1 : 0 },
          ...(rated ? { $max: { peak: after.get(id)! } } : {}),
        },
        { upsert: true }
      );
    })
  );

  await GameMatch.create({
    room: finished._id,
    game: finished.game,
    campus: finished.campus,
    mode: finished.mode,
    rated,
    players: finished.seats.map((s) => {
      const id = s.user ? String(s.user) : `bot-${s.seat}`;
      const entry = placementOf.get(id);
      return {
        user: s.user,
        isBot: s.isBot,
        placement: entry?.placement ?? finished.seats.length,
        score: entry?.score,
        ratingBefore: before.get(id),
        ratingAfter: after.get(id),
      };
    }),
    summary: options.disputed ? 'Players reported different results — no rating change.' : (result.summary ?? ''),
    durationSeconds: result.durationSeconds,
    source,
    tournament: finished.tournament,
  }).catch((error) => {
    if ((error as { code?: number }).code !== 11000) throw error;
  });

  const game = await getGame(finished.game);
  for (const id of humanIds) {
    if ((game?.completionPoints ?? 0) > 0) await award(id, 'game_completed', { entityType: 'GameRoom', entity: finished._id });
  }

  await broadcastRoom(finished);
  await container().realtime.publish(topics.gameRoom(String(finished._id)), 'game.room.finished', {
    roomId: String(finished._id),
    summary: finished.result?.summary ?? '',
  });

  if (finished.tournament) {
    const { onTournamentRoomFinished } = await import('./tournaments');
    await onTournamentRoomFinished(finished);
  }
  return finished;
}

/** A client's report. Accepted when a majority of the seated humans agree. */
export async function submitResult(room: LeanRoom, actor: Actor, result: GameResult): Promise<{ state: 'pending' | 'accepted' | 'disputed'; room: LeanRoom }> {
  if (room.status === 'finished') return { state: 'accepted', room };
  if (room.status !== 'playing') throw ApiError.conflict('That game is not in progress.');
  const seat = seatOf(room, actor.id);
  if (!seat || seat.left) throw ApiError.forbidden('Only players at the table report the result.');
  if (room.transport === 'dedicated') throw ApiError.forbidden("This game's server reports the result.");
  const problem = validateStandings(result, seatIds(room));
  if (problem) throw ApiError.unprocessable(problem);

  const key = standingsKey(result);
  const report = {
    user: new Types.ObjectId(actor.id),
    key,
    standings: result.standings,
    summary: result.summary ?? '',
    durationSeconds: result.durationSeconds,
    at: new Date(),
  };
  await GameRoom.updateOne({ _id: room._id, status: 'playing' }, { $pull: { reports: { user: report.user } } });
  const updated = await GameRoom.findOneAndUpdate(
    { _id: room._id, status: 'playing' },
    { $push: { reports: report }, $set: { lastActivityAt: new Date() } },
    { new: true }
  ).lean();
  if (!updated) return { state: 'accepted', room: (await GameRoom.findById(room._id).lean())! };

  return settle(updated, false);
}

/** Applies consensus to the reports so far; `force` settles a stale partial set. */
export async function settle(room: LeanRoom, force: boolean): Promise<{ state: 'pending' | 'accepted' | 'disputed'; room: LeanRoom }> {
  const voters = new Set(humanSeats(room).filter((s) => !s.left).map((s) => String(s.user)));
  const valid = room.reports.filter((r) => voters.has(String(r.user)));
  const consensus = resolveConsensus(valid.map((r) => r.key), voters.size);

  if (consensus.state === 'accepted') {
    const winner = valid.find((r) => r.key === consensus.key)!;
    const done = await finalize(room, { standings: winner.standings, summary: winner.summary, durationSeconds: winner.durationSeconds }, 'consensus');
    return { state: 'accepted', room: done };
  }
  if (consensus.state === 'disputed' || (force && valid.length > 0)) {
    // No majority, or the others never reported: keep the history, skip the rating.
    const counts = new Map<string, number>();
    for (const r of valid) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
    const [topKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const unanimous = counts.size === 1;
    const pick = valid.find((r) => r.key === topKey)!;
    const done = await finalize(
      room,
      { standings: pick.standings, summary: pick.summary, durationSeconds: pick.durationSeconds },
      'consensus',
      { rated: false, disputed: !unanimous }
    );
    return { state: unanimous ? 'accepted' : 'disputed', room: done };
  }
  await broadcastRoom(room);
  return { state: 'pending', room };
}

/** Trusted report from a dedicated server process. */
export async function serverReport(roomId: string, result: GameResult) {
  const room = await GameRoom.findById(roomId).lean();
  if (!room) throw ApiError.notFound('Unknown room.');
  if (room.status === 'finished') return room;
  if (room.status !== 'playing') throw ApiError.conflict('That game is not in progress.');
  const problem = validateStandings(result, seatIds(room));
  if (problem) throw ApiError.unprocessable(problem);
  return finalize(room, result, 'server');
}

/** Everyone else walked out: whoever is still standing wins. */
export async function finishByForfeit(room: LeanRoom): Promise<LeanRoom> {
  const standings = room.seats.map((s) => ({
    playerId: s.user ? String(s.user) : `bot-${s.seat}`,
    placement: s.left ? 2 : 1,
  }));
  if (!standings.some((s) => s.placement === 1)) standings.forEach((s) => (s.placement = 1));
  return finalize(room, { standings, summary: 'Won by forfeit.' }, 'forfeit');
}

/**
 * Single-device games (vs bot, pass-and-play) report for the record and the
 * completion points; they never touch ratings, since nothing can verify them.
 */
export async function recordSoloResult(actor: Actor, gameId: string, mode: 'bot' | 'local', result: GameResult | undefined) {
  const game = await getGame(gameId);
  if (!game || !isPlayable(game)) throw ApiError.notFound('That game is not available.');
  if (!game.modes.includes(mode)) throw ApiError.badRequest(`${game.title} has no ${mode === 'bot' ? 'vs-bot' : 'pass-and-play'} mode.`);
  const mine = result?.standings.find((s) => s.playerId === actor.id);
  const match = await GameMatch.create({
    game: game.id,
    campus: actor.campus,
    mode,
    rated: false,
    players: [{ user: actor.id, isBot: false, placement: mine?.placement ?? 1, score: mine?.score }],
    summary: result?.summary ?? '',
    durationSeconds: result?.durationSeconds,
    source: 'self',
  });
  await GameRating.updateOne(
    { user: actor.id, game: game.id },
    { $set: { campus: actor.campus, lastPlayedAt: new Date() }, $setOnInsert: { rating: 1200, peak: 1200 } },
    { upsert: true }
  );
  const points = game.completionPoints > 0 ? await award(actor.id, 'game_completed', { entityType: 'GameMatch', entity: match._id }) : null;
  return { matchId: String(match._id), points: points?.awarded ? points.amount : 0 };
}

/** Housekeeping for the maintenance cron. */
export async function sweepRooms(now = new Date()) {
  const staleLobbies = await GameRoom.updateMany(
    { status: 'lobby', lastActivityAt: { $lt: new Date(now.getTime() - 2 * 60 * 60_000) }, mode: 'online' },
    { $set: { status: 'abandoned' } }
  );

  // Partial reports that never completed: settle them.
  let settled = 0;
  const waiting = await GameRoom.find({ status: 'playing', 'reports.0': { $exists: true }, lastActivityAt: { $lt: new Date(now.getTime() - REPORT_GRACE_MS) } }).limit(200).lean();
  for (const room of waiting) {
    await settle(room, true);
    settled += 1;
  }

  // Games nobody touched for six hours are over.
  const dead = await GameRoom.updateMany(
    { status: 'playing', 'reports.0': { $exists: false }, lastActivityAt: { $lt: new Date(now.getTime() - 6 * 60 * 60_000) } },
    { $set: { status: 'abandoned' } }
  );
  return { abandonedLobbies: staleLobbies.modifiedCount, settled, abandonedGames: dead.modifiedCount };
}
