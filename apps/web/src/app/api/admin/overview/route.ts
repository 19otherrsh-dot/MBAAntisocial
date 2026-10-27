import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import Campus from '@/models/Campus';
import { successMetrics } from '@/server/modules/admin/metrics';

const querySchema = z.object({
  campus: z.string().trim().max(120).optional(),
  window: z.coerce.number().int().refine((d) => [30, 120, 365].includes(d)).default(120),
});

/** PRD §9 success metrics for the platform or one campus, plus the campus pipeline. */
export const GET = route({ requirePlatformAdmin: true, query: querySchema }, async ({ query }) => {
  const [metrics, byStatus] = await Promise.all([
    successMetrics(query.campus ?? null, query.window),
    Campus.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  return ok({ metrics, campuses: Object.fromEntries(byStatus.map((s) => [s._id, s.count])) });
});
