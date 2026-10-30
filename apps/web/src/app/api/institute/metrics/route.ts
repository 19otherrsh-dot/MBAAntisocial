import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { cachedSuccessMetrics } from '@/server/modules/admin/metrics';

const querySchema = z.object({
  window: z.coerce.number().int().refine((d) => [30, 120, 365].includes(d)).default(120),
  /** Any value skips the cache; clients send a counter so each recompute is a distinct request. */
  fresh: z.coerce.number().int().optional(),
});

/** The PRD §9 metrics for the caller's own campus. Staff and admins. */
export const GET = route({ requireStaff: true, query: querySchema }, async ({ actor, query }) =>
  ok(await cachedSuccessMetrics(actor.campus, query.window, query.fresh !== undefined))
);
