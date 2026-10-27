import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** Did you go? One mark per course per class (slot) per day. */
export interface IAttendanceMark {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  course: Types.ObjectId;
  /** YYYY-MM-DD in the user's zone. */
  day: string;
  /** Distinguishes two classes of the same course on one day. */
  slot?: Types.ObjectId;
  status: 'present' | 'absent' | 'cancelled';
  createdAt: Date;
}

type AttendanceMarkModel = Model<IAttendanceMark>;

const AttendanceMarkSchema = new Schema<IAttendanceMark, AttendanceMarkModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    slot: { type: Schema.Types.ObjectId, ref: 'ClassSlot' },
    status: { type: String, enum: ['present', 'absent', 'cancelled'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AttendanceMarkSchema.index({ user: 1, course: 1, day: 1, slot: 1 }, { unique: true });
AttendanceMarkSchema.index({ user: 1, day: -1 });

const AttendanceMark =
  (mongoose.models.AttendanceMark as AttendanceMarkModel) || mongoose.model<IAttendanceMark, AttendanceMarkModel>('AttendanceMark', AttendanceMarkSchema);
export default AttendanceMark;
