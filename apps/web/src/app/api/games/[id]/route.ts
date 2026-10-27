import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import GameRating from '@/models/games/GameRating';
import GameMatch from '@/models/games/GameMatch';
import GameRoom from '@/models/games/GameRoom';
import Tournament from '@/models/games/Tournament';
import User from '@/models/User';
import { buildEntryUrl, getGame, isPlayable, thumbnailUrl } from '@/server/modules/games/registry';
import { viewRoom } from '@/server/modules/games/rooms';

const querySchema = z.object({ board: z.enum(['campus', 'everyone']).default('campus') });

/** One game: manifest, the caller's record, leaderboard, open tables, tournaments. */
export const GET = route({ feature: 'games', query: querySchema }, async ({ actor, params, query }) => {
  const game = await getGame(params.id);
  if (!game) throw ApiError.notFound('That game does not exist.');

  const boardFilter = { game: game.id, gamesPlayed: { $gte: 1 }, ...(query.board === 'campus' ? { campus: actor.campus } : {}) };
  const [me, board, history, tables, tournaments] = await Promise.all([
    GameRating.findOne({ user: actor.id, game: game.id }).lean(),
    game.rated ? GameRating.find(boardFilter).sort({ rating: -1 }).limit(25).lean() : Promise.resolve([]),
    GameMatch.find({ 'players.user': actor.id, game: game.id }).sort({ finishedAt: -1 }).limit(10).lean(),
    GameRoom.find({
      game: game.id,
      status: 'lobby',
      visibility: 'public',
      mode: 'online',
      $or: [{ campus: actor.campus }, { crossCampus: true }],
      lastActivityAt: { $gte: new Date(Date.now() - 30 * 60_000) },
    })
      .sort({ createdAt: -1 })
      .limit(12)
      .lean(),
    Tournament.find({ campus: actor.campus, game: game.id, status: { $in: ['registration', 'running'] } }).sort({ startsAt: 1 }).limit(5).lean(),
  ]);

  const people = await User.find({ _id: { $in: [...board.map((b) => b.user), ...history.flatMap((h) => h.players.flatMap((p) => (p.user ? [p.user] : [])))] } })
    .select('name image campus')
    .lean();
  const person = new Map(people.map((p) => [String(p._id), p]));

  return ok({
    game: { ...game, thumbnail: thumbnailUrl(game) },
    playable: isPlayable(game),
    entryUrl: buildEntryUrl(game),
    me: me ? { rating: me.rating, peak: me.peak, played: me.gamesPlayed, wins: me.wins, losses: me.losses, draws: me.draws } : null,
    leaderboard: board.map((b, i) => ({
      rank: i + 1,
      user: { _id: String(b.user), name: person.get(String(b.user))?.name ?? 'Player', image: person.get(String(b.user))?.image ?? '', campus: person.get(String(b.user))?.campus ?? '' },
      rating: b.rating,
      played: b.gamesPlayed,
      wins: b.wins,
    })),
    history: history.map((h) => {
      const mine = h.players.find((p) => String(p.user) === actor.id);
      return {
        _id: String(h._id),
        mode: h.mode,
        rated: h.rated,
        placement: mine?.placement ?? null,
        delta: mine?.ratingAfter != null && mine.ratingBefore != null ? mine.ratingAfter - mine.ratingBefore : null,
        opponents: h.players.filter((p) => String(p.user) !== actor.id).map((p) => (p.isBot ? 'Bot' : person.get(String(p.user))?.name ?? 'Player')),
        summary: h.summary,
        finishedAt: h.finishedAt,
      };
    }),
    tables: await Promise.all(tables.map(viewRoom)),
    tournaments: tournaments.map((t) => ({ _id: String(t._id), title: t.title, status: t.status, startsAt: t.startsAt, entrants: t.entrants.length, maxEntrants: t.maxEntrants })),
  });
});
