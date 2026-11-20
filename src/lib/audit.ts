import AuditLog, { type AuditAction } from '@/models/AuditLog';

export interface AuditEntry {
  actor: { id: string; campus: string; name?: string; role?: string };
  action: AuditAction;
  target: { type: string; id?: string; label?: string };
  detail?: Record<string, unknown>;
}

/**
 * Writes one audit row. Never throws: a failure to log is reported to the
 * server log, but must not fail the action that was being logged — the
 * suspension still happened, and saying otherwise would be worse.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      actor: entry.actor.id,
      actorName: entry.actor.name ?? '',
      actorRole: entry.actor.role ?? '',
      campus: entry.actor.campus,
      action: entry.action,
      targetType: entry.target.type,
      targetId: entry.target.id,
      targetLabel: (entry.target.label ?? '').slice(0, 200),
      detail: entry.detail ?? {},
    });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', msg: 'audit write failed', action: entry.action, error: String(error) }));
  }
}
