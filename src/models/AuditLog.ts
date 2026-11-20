import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * Append-only record of privileged and security-relevant actions.
 *
 * Nothing in the app updates or deletes these rows — there is no code path
 * that can — so the log is evidence rather than a status field. Institutes ask
 * "who suspended this student, when, and why" and "who made her a moderator";
 * this is where the answer lives.
 */
export const AUDIT_ACTIONS = [
  'account.provisioned_sso',
  'account.password_reset',
  'account.deleted',
  'role.changed',
  'user.suspended',
  'user.restored',
  'report.resolved',
  'content.hidden',
  'comp.created',
  'comp.updated',
  'comp.archived',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface IAuditLog {
  _id: Types.ObjectId;
  /** Who did it. Kept as an id even after that account is deleted. */
  actor: Types.ObjectId;
  /** Their name and role at the time, so the log still reads after changes. */
  actorName: string;
  actorRole: string;
  campus: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  targetLabel: string;
  /** Small structured context: before/after values, a reason. */
  detail: Record<string, unknown>;
  createdAt: Date;
}

type AuditLogModel = Model<IAuditLog>;

const AuditLogSchema = new Schema<IAuditLog, AuditLogModel>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, default: '', maxlength: 120 },
    actorRole: { type: String, default: '', maxlength: 40 },
    campus: { type: String, required: true, maxlength: 120 },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    targetType: { type: String, required: true, maxlength: 40 },
    targetId: { type: String, maxlength: 64 },
    targetLabel: { type: String, default: '', maxlength: 200 },
    detail: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ campus: 1, createdAt: -1 });
AuditLogSchema.index({ campus: 1, targetId: 1, createdAt: -1 });
AuditLogSchema.index({ campus: 1, action: 1, createdAt: -1 });

// Belt and braces: refuse updates at the model layer too.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'] as const) {
  AuditLogSchema.pre(op, function refuse() {
    throw new Error('The audit log is append-only.');
  });
}

const AuditLog =
  (mongoose.models.AuditLog as AuditLogModel) ||
  mongoose.model<IAuditLog, AuditLogModel>('AuditLog', AuditLogSchema);

export default AuditLog;
