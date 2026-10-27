import { route, ok } from '@/lib/api/handler';
import GameMatch from '@/models/games/GameMatch';
import User from '@/models/User';
import { listGames } from '@/server/modules/games/registry';

/** The caller's recent games across every title. */
export const GET = route({ feature: 'games' }, async ({ actor }) => {
  const [matches, games] = await Promise.all([GameMatch.find({ 'players.user': actor.id }).sort({ finishedAt: -1 }).limit(30).lean(), listGames()]);
  const titles = new Map(games.map((g) => [g.id, g.title]));
  const people = await User.find({ _id: { $in: matches.flatMap((m) => m.players.flatMap((p) => (p.user ? [p.user] : []))) } }).select('name').lean();
  const nameOf = new Map(people.map((p) => [String(p._id), p.name]));
  return ok({
    matches: matches.map((m) => {
      const mine = m.players.find((p) => String(p.user) === actor.id);
      return {
        _id: String(m._id),
        game: m.game,
        title: titles.get(m.game) ?? m.game,
        mode: m.mode,
        rated: m.rated,
        placement: mine?.placement ?? null,
        players: m.players.length,
        delta: mine?.ratingAfter != null && mine.ratingBefore != null ? mine.ratingAfter - mine.ratingBefore : null,
        opponents: m.players.filter((p) => String(p.user) !== actor.id).map((p) => (p.isBot ? 'Bot' : nameOf.get(String(p.user)) ?? 'Player')),
        summary: m.summary,
        finishedAt: m.finishedAt,
      };
    }),
  });
});
