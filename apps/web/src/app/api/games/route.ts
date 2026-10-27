import { route, ok } from '@/lib/api/handler';
import GameRoom from '@/models/games/GameRoom';
import GameRating from '@/models/games/GameRating';
import Tournament from '@/models/games/Tournament';
import { isPlayable, listGames, thumbnailUrl } from '@/server/modules/games/registry';
import { liveRoomsFor, viewRoom } from '@/server/modules/games/rooms';

/** The catalog with the caller's ratings, open-table counts, and their live games. */
export const GET = route({ feature: 'games' }, async ({ actor }) => {
  const [games, ratings, open, live, tournaments] = await Promise.all([
    listGames(),
    GameRating.find({ user: actor.id }).select('game rating gamesPlayed wins').lean(),
    GameRoom.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'lobby', visibility: 'public', mode: 'online', $or: [{ campus: actor.campus }, { crossCampus: true }] } },
      { $group: { _id: '$game', count: { $sum: 1 } } },
    ]),
    liveRoomsFor(actor.id),
    Tournament.countDocuments({ campus: actor.campus, status: { $in: ['registration', 'running'] } }),
  ]);
  const ratingOf = new Map(ratings.map((r) => [r.game, r]));
  const openOf = new Map(open.map((o) => [o._id, o.count]));
  return ok({
    games: games.map((g) => ({
      id: g.id,
      title: g.title,
      tagline: g.tagline,
      category: g.category,
      minPlayers: g.minPlayers,
      maxPlayers: g.maxPlayers,
      modes: g.modes,
      estimatedMinutes: g.estimatedMinutes,
      thumbnail: thumbnailUrl(g),
      playable: isPlayable(g),
      rated: g.rated,
      openTables: openOf.get(g.id) ?? 0,
      me: ratingOf.has(g.id) ? { rating: ratingOf.get(g.id)!.rating, played: ratingOf.get(g.id)!.gamesPlayed, wins: ratingOf.get(g.id)!.wins } : null,
    })),
    live: await Promise.all(live.map(viewRoom)),
    activeTournaments: tournaments,
  });
});
