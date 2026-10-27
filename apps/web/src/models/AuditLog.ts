import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * Every privileged change — a campus unlocked, a role granted, a release
 * published — with who made it and what it was before. Append-only.
 */
export interface IAuditLog {
  _id: Types.ObjectId;
  actor: Types.ObjectId;
  /** The campus the change belongs to, when it has one (scopes the campus admin's view). */
  campus: string;
  action: string;
  targetType: 'campus' | 'user' | 'game_release';
  targetId: string;
  targetLabel: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog, Model<IAuditLog>>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    campus: { type: String, default: '' },
    action: { type: String, required: true, maxlength: 60 },
    targetType: { type: String, enum: ['campus', 'user', 'game_release'], required: true },
    targetId: { type: String, required: true },
    targetLabel: { type: String, default: '', maxlength: 200 },
    before: { type: Schema.Types.Mixed, default: {} },
    after: { type: Schema.Types.Mixed, default: {} },
    reason: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ campus: 1, createdAt: -1 });

const AuditLog = (mongoose.models.AuditLog as Model<IAuditLog>) || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
export default AuditLog;
