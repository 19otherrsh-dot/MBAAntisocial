import { route, ok } from '@/lib/api/handler';
import { tournamentActionSchema } from '@/server/modules/games/schemas';
import { cancelTournament, loadTournament, register, startTournament, tournamentView, withdraw } from '@/server/modules/games/tournaments';
import { getGame } from '@/server/modules/games/registry';

export const GET = route({ feature: 'games' }, async ({ actor, params }) => {
  const t = await loadTournament(params.id, actor.campus);
  const game = await getGame(t.game);
  return ok({ tournament: await tournamentView(t.toObject(), actor.id), game: game ? { id: game.id, title: game.title } : null, canManage: String(t.createdBy) === actor.id || actor.canModerate });
});

export const POST = route({ body: tournamentActionSchema, rateLimit: 'write', feature: 'games' }, async ({ actor, params, body }) => {
  const t = await loadTournament(params.id, actor.campus);
  switch (body.action) {
    case 'register':
      await register(t, actor);
      break;
    case 'withdraw':
      await withdraw(t, actor);
      break;
    case 'start':
      await startTournament(t, actor);
      break;
    case 'cancel':
      await cancelTournament(t, actor);
      break;
  }
  const fresh = await loadTournament(params.id, actor.campus);
  return ok({ tournament: await tournamentView(fresh.toObject(), actor.id) });
});
