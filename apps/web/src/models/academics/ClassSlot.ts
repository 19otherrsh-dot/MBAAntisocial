import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** One weekly recurring class: Tuesday 09:00–10:30, room C-12. */
export interface IClassSlot {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  course: Types.ObjectId;
  /** Monday = 0 … Sunday = 6. */
  day: number;
  start: string;
  end: string;
  room: string;
  kind: 'lecture' | 'tutorial' | 'lab' | 'other';
}

type ClassSlotModel = Model<IClassSlot>;

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

const ClassSlotSchema = new Schema<IClassSlot, ClassSlotModel>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  day: { type: Number, required: true, min: 0, max: 6 },
  start: { type: String, required: true, match: clock },
  end: { type: String, required: true, match: clock },
  room: { type: String, default: '', trim: true, maxlength: 40 },
  kind: { type: String, enum: ['lecture', 'tutorial', 'lab', 'other'], default: 'lecture' },
});

ClassSlotSchema.index({ user: 1, day: 1, start: 1 });
ClassSlotSchema.index({ course: 1 });

const ClassSlot = (mongoose.models.ClassSlot as ClassSlotModel) || mongoose.model<IClassSlot, ClassSlotModel>('ClassSlot', ClassSlotSchema);
export default ClassSlot;
