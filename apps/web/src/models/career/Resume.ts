import mongoose, { Schema, type Model, type Types } from 'mongoose';
import type { ResumeData } from '@mba/shared/resume';

export type { ResumeData } from '@mba/shared/resume';

/** A structured, one-page resume. Stored as one document per person. */
export interface IResume {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  data: ResumeData;
  target: string;
  updatedAt: Date;
}

const ResumeSchema = new Schema<IResume, Model<IResume>>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // Validated by resumeDataSchema at the route; stored as one document.
    data: { type: Schema.Types.Mixed, required: true },
    target: { type: String, default: '', maxlength: 80 },
  },
  { timestamps: { createdAt: false, updatedAt: true }, minimize: false }
);

const Resume = (mongoose.models.Resume as Model<IResume>) || mongoose.model<IResume>('Resume', ResumeSchema);
export default Resume;
