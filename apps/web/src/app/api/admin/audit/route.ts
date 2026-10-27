import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { listAudit } from '@/server/modules/admin/audit';

const querySchema = z.object({ campus: z.string().trim().max(120).optional(), before: z.coerce.date().optional() });

export const GET = route({ requirePlatformAdmin: true, query: querySchema }, async ({ query }) => ok({ entries: await listAudit(query.campus ?? null, query.before) }));
