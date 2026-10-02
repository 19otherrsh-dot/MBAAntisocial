import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { REPORT_REASONS, type ReportReason } from '@/lib/constants';

/**
 * A user-filed report against content.
 *
 * §11 makes moderation tooling a precondition for shipping anything anonymous;
 * this collection plus the `hiddenAt` fields on Post and Resource are that
 * precondition, present from the first release rather than bolted on later.
 */
export interface IReport {
  _id: Types.ObjectId;
  reporter: Types.ObjectId;
  campus: string;

  targetType: 'post' | 'comment' | 'resource' | 'user' | 'whisper';
  target: Types.ObjectId;
  /** Set when the target is a comment nested inside a post. */
  parent?: Types.ObjectId;

  reason: ReportReason;
  detail: string;

  status: 'open' | 'actioned' | 'dismissed';
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolutionNote: string;

  createdAt: Date;
  updatedAt: Date;
}

type ReportModel = Model<IReport>;

const ReportSchema = new Schema<IReport, ReportModel>(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    campus: { type: String, required: true },

    targetType: { type: String, enum: ['post', 'comment', 'resource', 'user', 'whisper'], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
    parent: { type: Schema.Types.ObjectId },

    reason: { type: String, enum: REPORT_REASONS, required: true },
    detail: { type: String, default: '', maxlength: 1000 },

    status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolutionNote: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: true }
);

// Moderator queue.
ReportSchema.index({ campus: 1, status: 1, createdAt: -1 });
// One report per user per target — re-filing should not inflate the queue.
ReportSchema.index({ reporter: 1, target: 1 }, { unique: true });

const Report =
  (mongoose.models.Report as ReportModel) ||
  mongoose.model<IReport, ReportModel>('Report', ReportSchema);

export default Report;
