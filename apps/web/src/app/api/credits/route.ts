import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import User from '@/models/User';
import { CREDIT_COST, CREDIT_EARN, CREDIT_PERKS, creditHistory, spendCredits } from '@/server/modules/credits/service';

/** Balance, history, and what credits buy. */
export const GET = route({}, async ({ actor }) => {
  const [user, history] = await Promise.all([User.findById(actor.id).select('credits').lean(), creditHistory(actor.id)]);
  return ok({
    balance: user?.credits ?? 0,
    history: history.map((h) => ({ ...h, _id: String(h._id) })),
    earn: CREDIT_EARN,
    perks: CREDIT_PERKS.map((p) => ({ ...p, cost: CREDIT_COST[p.reason] })),
  });
});

const spendSchema = z.object({ reason: z.literal('priority_booking') });

/** Buys a self-contained perk. Referral priority and listing boosts are bought where they apply. */
export const POST = route({ body: spendSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const balance = await spendCredits(actor.id, body.reason);
  return ok({ balance });
});
