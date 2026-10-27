import AuditLog, { type IAuditLog } from '@/models/AuditLog';

type AuditEntry = Pick<IAuditLog, 'action' | 'targetType' | 'targetId'> &
  Partial<Pick<IAuditLog, 'campus' | 'targetLabel' | 'before' | 'after' | 'reason'>>;

/** Records a privileged change. Never throws: an audit write must not undo the change it records. */
export async function audit(actorId: string, entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({ actor: actorId, ...entry });
  } catch (error) {
    console.error('[audit] could not record', entry.action, error);
  }
}

/** Only the fields that actually changed, for a compact before/after. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const was: Record<string, unknown> = {};
  const now: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(value)) {
      was[key] = before[key];
      now[key] = value;
    }
  }
  return { before: was, after: now, changed: Object.keys(now).length > 0 };
}

/** Newest first, fifty at a time; `before` pages back. */
export async function listAudit(campus: string | null, before?: Date) {
  const filter: Record<string, unknown> = {};
  if (campus) filter.campus = campus;
  if (before) filter.createdAt = { $lt: before };
  const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(50).populate('actor', 'name email').lean();
  return rows.map((r) => ({
    _id: String(r._id),
    actor: (r.actor as unknown as { name?: string; email?: string } | null) ?? null,
    campus: r.campus,
    action: r.action,
    targetType: r.targetType,
    targetLabel: r.targetLabel,
    before: r.before,
    after: r.after,
    reason: r.reason,
    createdAt: r.createdAt,
  }));
}
