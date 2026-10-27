import { route, ok } from '@/lib/api/handler';
import { roomActionSchema } from '@/server/modules/games/schemas';
import {
  addBot,
  inviteToRoom,
  joinRoom,
  kickFromRoom,
  leaveRoom,
  loadRoom,
  removeBot,
  seatOf,
  setReady,
  spectateRoom,
  startRoom,
  updateOptions,
  viewRoom,
} from '@/server/modules/games/rooms';
import { getGame } from '@/server/modules/games/registry';

export const GET = route({ feature: 'games' }, async ({ actor, params }) => {
  const room = await loadRoom(params.id, actor);
  const game = await getGame(room.game);
  const seat = seatOf(room, actor.id);
  return ok({
    room: await viewRoom(room),
    game: game ? { id: game.id, title: game.title, minPlayers: game.minPlayers, maxPlayers: game.maxPlayers, botBackfill: game.network.botBackfill, spectators: game.network.spectators, orientation: game.orientation } : null,
    me: {
      seated: Boolean(seat),
      seat: seat?.seat ?? null,
      host: String(room.host) === actor.id,
      spectating: room.spectators.some((s) => String(s) === actor.id),
      reported: room.reports.some((r) => String(r.user) === actor.id),
    },
  });
});

/** Every lobby action in one place; each checks its own preconditions. */
export const POST = route({ body: roomActionSchema, rateLimit: 'game', feature: 'games' }, async ({ actor, params, body }) => {
  const room = await loadRoom(params.id, actor);
  let next = room;
  switch (body.action) {
    case 'join':
      next = await joinRoom(room, actor);
      break;
    case 'spectate':
      next = await spectateRoom(room, actor);
      break;
    case 'leave':
      next = (await leaveRoom(room, actor.id)) ?? room;
      break;
    case 'ready':
      next = await setReady(room, actor.id, body.ready);
      break;
    case 'start':
      next = await startRoom(room, actor.id);
      break;
    case 'kick':
      next = await kickFromRoom(room, actor.id, body.userId);
      break;
    case 'add_bot':
      next = await addBot(room, actor.id);
      break;
    case 'remove_bot':
      next = await removeBot(room, actor.id, body.seat);
      break;
    case 'options':
      next = await updateOptions(room, actor.id, body.options, body.visibility);
      break;
    case 'invite':
      return ok({ invited: await inviteToRoom(room, actor, body.userIds) });
  }
  return ok({ room: await viewRoom(next) });
});
