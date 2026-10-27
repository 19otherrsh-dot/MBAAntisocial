import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import Tournament from '@/models/games/Tournament';
import { listGames } from '@/server/modules/games/registry';
import { createTournament } from '@/server/modules/games/tournaments';
import { createTournamentSchema } from '@/server/modules/games/schemas';

const querySchema = z.object({ scope: z.enum(['active', 'past', 'mine']).default('active') });

export const GET = route({ feature: 'games', query: querySchema }, async ({ actor, query }) => {
  const filter: Record<string, unknown> =
    query.scope === 'mine'
      ? { campus: actor.campus, entrants: actor.id }
      : query.scope === 'past'
        ? { campus: actor.campus, status: { $in: ['finished', 'cancelled'] } }
        : { campus: actor.campus, status: { $in: ['registration', 'running'] } };
  const [rows, games] = await Promise.all([
    Tournament.find(filter).sort(query.scope === 'active' ? { startsAt: 1 } : { startsAt: -1 }).limit(40).populate('winner', 'name').lean(),
    listGames(),
  ]);
  const titles = new Map(games.map((g) => [g.id, g.title]));
  return ok({
    tournaments: rows.map((t) => ({
      _id: String(t._id),
      title: t.title,
      game: t.game,
      gameTitle: titles.get(t.game) ?? t.game,
      format: t.format,
      status: t.status,
      startsAt: t.startsAt,
      entrants: t.entrants.length,
      maxEntrants: t.maxEntrants,
      registered: t.entrants.some((e) => String(e) === actor.id),
      winner: (t.winner as unknown as { name?: string } | undefined)?.name ?? null,
    })),
    games: games.filter((g) => g.modes.includes('tournament') && g.build && g.minPlayers <= 2).map((g) => ({ id: g.id, title: g.title })),
  });
});

export const POST = route({ body: createTournamentSchema, rateLimit: 'write', feature: 'games' }, async ({ actor, body }) => {
  const tournament = await createTournament(actor, body);
  return created({ tournament: { _id: String(tournament._id) } });
});
