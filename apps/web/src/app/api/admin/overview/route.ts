import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import Campus from '@/models/Campus';
import { cachedSuccessMetrics } from '@/server/modules/admin/metrics';

const querySchema = z.object({
  campus: z.string().trim().max(120).optional(),
  window: z.coerce.number().int().refine((d) => [30, 120, 365].includes(d)).default(120),
  /** Any value skips the cache; clients send a counter so each recompute is a distinct request. */
  fresh: z.coerce.number().int().optional(),
});

/** PRD §9 success metrics for the platform or one campus, plus the campus pipeline. */
export const GET = route({ requirePlatformAdmin: true, query: querySchema }, async ({ query }) => {
  const [{ metrics, computedAt }, byStatus] = await Promise.all([
    cachedSuccessMetrics(query.campus ?? null, query.window, query.fresh !== undefined),
    Campus.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  return ok({ metrics, computedAt, campuses: Object.fromEntries(byStatus.map((s) => [s._id, s.count])) });
});
