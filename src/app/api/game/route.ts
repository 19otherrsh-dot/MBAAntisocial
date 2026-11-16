import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { award } from '@/lib/gamification';
import { dayKey } from '@/lib/time';
import { loadGameState, questEntity, chestEntity, pathEntity } from '@/lib/game/state';
import { questsFor, CHEST_XP } from '@/lib/game/quests';
import { pathFor } from '@/lib/game/path';
import { DAILY_GOALS } from '@/lib/game/levels';
import User from '@/models/User';

/** The whole game layer for the caller: level, today, quests, path, unseen celebrations. */
export const GET = route({}, async ({ actor }) => ok(await loadGameState(actor.id)));

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim_quest'), key: z.string().max(40) }),
  z.object({ action: z.literal('claim_chest') }),
  z.object({ action: z.literal('claim_path'), key: z.string().max(40) }),
  z.object({
    action: z.literal('set_goal'),
    goal: z.coerce.number().int().refine((value) => DAILY_GOALS.some((goal) => goal.xp === value), 'Pick one of the goals.'),
  }),
  z.object({
    action: z.literal('ack'),
    level: z.coerce.number().int().min(1).max(1000).optional(),
    achievements: z.record(z.string().max(40), z.coerce.number().int().min(0).max(20)).optional(),
  }),
]);

/**
 * Claims and settings. Every claim is checked against the server's own view of
 * progress — the client only says which reward it wants — and pays through a
 * deterministic ledger entity, so a retry or a second tab cannot pay twice.
 */
export const POST = route({ body: actionSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const day = dayKey();

  if (body.action === 'set_goal') {
    await User.updateOne({ _id: actor.id }, { $set: { dailyGoal: body.goal } });
    return ok(await loadGameState(actor.id));
  }

  if (body.action === 'ack') {
    const set: Record<string, number> = {};
    if (body.level) set['celebrated.level'] = body.level;
    for (const [key, tier] of Object.entries(body.achievements ?? {})) set[`celebrated.achievements.${key}`] = tier;
    if (Object.keys(set).length > 0) await User.updateOne({ _id: actor.id }, { $max: set });
    return ok({ acknowledged: true });
  }

  const state = await loadGameState(actor.id);

  if (body.action === 'claim_quest') {
    const quest = questsFor(actor.id, day, actor.canMentor).find((entry) => entry.key === body.key);
    const progress = state.quests.find((entry) => entry.key === body.key);
    if (!quest || !progress) throw ApiError.notFound('That is not one of today’s quests.');
    if (progress.progress < quest.target) throw ApiError.conflict('Not finished yet.');
    const result = await award(actor.id, 'quest_reward', {
      entityType: 'quest',
      entity: questEntity(actor.id, day, quest.key),
      amount: quest.xp,
    });
    return ok({ awarded: result.awarded ? result.amount : 0, state: await loadGameState(actor.id) });
  }

  if (body.action === 'claim_chest') {
    if (!state.chest.ready) throw ApiError.conflict('Finish all three quests to open the chest.');
    const result = await award(actor.id, 'chest_reward', {
      entityType: 'chest',
      entity: chestEntity(actor.id, day),
      amount: CHEST_XP,
    });
    return ok({ awarded: result.awarded ? result.amount : 0, state: await loadGameState(actor.id) });
  }

  // claim_path
  const step = pathFor(actor.canMentor).find((entry) => entry.key === body.key);
  const status = state.path.find((entry) => entry.key === body.key);
  if (!step || !status) throw ApiError.notFound('That step is not on your path.');
  if (status.status !== 'done') throw ApiError.conflict('Reach that step first.');
  const result = await award(actor.id, 'path_reward', {
    entityType: 'path',
    entity: pathEntity(actor.id, step.key),
    amount: step.xp,
  });
  return ok({ awarded: result.awarded ? result.amount : 0, state: await loadGameState(actor.id) });
});
