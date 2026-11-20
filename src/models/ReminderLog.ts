import mongoose, { Schema, type Model } from 'mongoose';

/**
 * One row per reminder sent, keyed so the same reminder can never go out
 * twice — the job can run every hour, be retried, or overlap with itself, and
 * the unique key is what keeps it idempotent. Rows expire after sixty days.
 */
export interface IReminderLog {
  key: string;
  createdAt: Date;
}

const ReminderLogSchema = new Schema<IReminderLog>(
  {
    key: { type: String, required: true, maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ReminderLogSchema.index({ key: 1 }, { unique: true });
ReminderLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

const ReminderLog =
  (mongoose.models.ReminderLog as Model<IReminderLog>) ||
  mongoose.model<IReminderLog>('ReminderLog', ReminderLogSchema);

export default ReminderLog;
