import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * A course in someone's own term plan. Personal by design: attendance and
 * grades are nobody else's business, so nothing here is campus-shared.
 */
export interface GradeComponent {
  name: string;
  weight: number;
  score?: number;
  max: number;
}

export interface ICourse {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  term: string;
  code: string;
  name: string;
  professor: string;
  credits: number;
  color: string;
  requiredAttendance: number;
  /** Total sessions in the term, if known — enables "can I still make it". */
  plannedSessions?: number;
  components: GradeComponent[];
  /** Final letter grade once out. */
  grade: string;
  archived: boolean;
  createdAt: Date;
}

type CourseModel = Model<ICourse>;

const CourseSchema = new Schema<ICourse, CourseModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    term: { type: String, default: '', trim: true, maxlength: 40 },
    code: { type: String, default: '', trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    professor: { type: String, default: '', trim: true, maxlength: 80 },
    credits: { type: Number, default: 3, min: 0, max: 20 },
    color: { type: String, default: '#5b4bdb', maxlength: 9 },
    requiredAttendance: { type: Number, default: 75, min: 0, max: 100 },
    plannedSessions: { type: Number, min: 0, max: 400 },
    components: [
      new Schema<GradeComponent>(
        {
          name: { type: String, required: true, maxlength: 60 },
          weight: { type: Number, required: true, min: 0, max: 100 },
          score: { type: Number, min: 0 },
          max: { type: Number, default: 100, min: 0.01 },
        },
        { _id: false }
      ),
    ],
    grade: { type: String, default: '', maxlength: 4 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CourseSchema.index({ user: 1, archived: 1, term: 1 });

const Course = (mongoose.models.Course as CourseModel) || mongoose.model<ICourse, CourseModel>('Course', CourseSchema);
export default Course;
