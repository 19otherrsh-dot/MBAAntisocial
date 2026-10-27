import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * A private daily check-in. Only its author can ever read it: no aggregate,
 * report, or admin view touches this collection.
 */
export interface ICheckIn {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  day: string;
  mood: number;
  energy: number;
  sleepHours?: number;
  stressors: string[];
  note: string;
  createdAt: Date;
}

type CheckInModel = Model<ICheckIn>;

export const STRESSORS = ['placements', 'academics', 'money', 'sleep', 'health', 'relationships', 'family', 'loneliness', 'workload', 'future'] as const;

const CheckInSchema = new Schema<ICheckIn, CheckInModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    mood: { type: Number, required: true, min: 1, max: 5 },
    energy: { type: Number, required: true, min: 1, max: 5 },
    sleepHours: { type: Number, min: 0, max: 24 },
    stressors: [{ type: String, enum: STRESSORS }],
    note: { type: String, default: '', maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CheckInSchema.index({ user: 1, day: -1 }, { unique: true });

const CheckIn = (mongoose.models.CheckIn as CheckInModel) || mongoose.model<ICheckIn, CheckInModel>('CheckIn', CheckInSchema);
export default CheckIn;
