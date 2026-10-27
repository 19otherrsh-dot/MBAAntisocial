import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * Proof that a reminder went out, so overlapping cron runs and retries can
 * never send the same "starts in an hour" twice. The unique index is the lock.
 */
export interface IReminderLog {
  _id: Types.ObjectId;
  rule: string;
  user: Types.ObjectId;
  entity: Types.ObjectId;
  sentAt: Date;
}

type ReminderLogModel = Model<IReminderLog>;

const ReminderLogSchema = new Schema<IReminderLog, ReminderLogModel>({
  rule: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, required: true },
  entity: { type: Schema.Types.ObjectId, required: true },
  sentAt: { type: Date, default: Date.now },
});

ReminderLogSchema.index({ rule: 1, user: 1, entity: 1 }, { unique: true });
ReminderLogSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

const ReminderLog =
  (mongoose.models.ReminderLog as ReminderLogModel) ||
  mongoose.model<IReminderLog, ReminderLogModel>('ReminderLog', ReminderLogSchema);

export default ReminderLog;
