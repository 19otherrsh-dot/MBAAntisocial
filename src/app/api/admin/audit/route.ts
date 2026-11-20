import { z } from 'zod';
import type { QueryFilter } from 'mongoose';
import { route, ok, paginate, pageMeta } from '@/lib/api/handler';
import AuditLog, { AUDIT_ACTIONS, type IAuditLog } from '@/models/AuditLog';

const querySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
  format: z.enum(['json', 'csv']).default('json'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Quote everything, and defuse spreadsheet formulas.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The campus audit trail, newest first. `format=csv` downloads it for records. */
export const GET = route({ query: querySchema, requireAdmin: true }, async ({ actor, query }) => {
  const filter: QueryFilter<IAuditLog> = { campus: actor.campus };
  if (query.action) filter.action = query.action;
  if (query.targetId) filter.targetId = query.targetId;

  if (query.format === 'csv') {
    const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(10_000).lean();
    const header = ['when', 'action', 'actor', 'actor_role', 'target_type', 'target_id', 'target', 'detail'];
    const lines = rows.map((row) =>
      [row.createdAt.toISOString(), row.action, row.actorName, row.actorRole, row.targetType, row.targetId, row.targetLabel, row.detail]
        .map(csvCell)
        .join(',')
    );
    return new Response([header.join(','), ...lines].join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const { skip, limit } = paginate(query);
  const [entries, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return ok({
    entries: entries.map((entry) => ({ ...entry, _id: String(entry._id), actor: String(entry.actor) })),
    pagination: pageMeta(query, total),
  });
});
