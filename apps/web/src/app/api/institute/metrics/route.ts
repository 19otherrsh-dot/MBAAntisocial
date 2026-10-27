import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { successMetrics } from '@/server/modules/admin/metrics';

const querySchema = z.object({ window: z.coerce.number().int().refine((d) => [30, 120, 365].includes(d)).default(120) });

/** The PRD §9 metrics for the caller's own campus. Staff and admins. */
export const GET = route({ requireStaff: true, query: querySchema }, async ({ actor, query }) =>
  ok({ metrics: await successMetrics(actor.campus, query.window) })
);
