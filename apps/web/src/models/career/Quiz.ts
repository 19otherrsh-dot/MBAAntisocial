import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface QuizQuestion {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  category: string;
}

/** The same five questions for everyone on a given day. */
export interface IQuizDay {
  _id: Types.ObjectId;
  day: string;
  questions: QuizQuestion[];
  source: 'ai' | 'bank';
}

export interface IQuizAttempt {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  campus: string;
  day: string;
  answers: number[];
  score: number;
  completedAt: Date;
}

const QuestionSchema = new Schema<QuizQuestion>(
  {
    prompt: { type: String, required: true, maxlength: 400 },
    options: [{ type: String, maxlength: 160 }],
    answerIndex: { type: Number, required: true, min: 0, max: 3 },
    explanation: { type: String, default: '', maxlength: 500 },
    category: { type: String, default: 'general' },
  },
  { _id: false }
);

const QuizDaySchema = new Schema<IQuizDay, Model<IQuizDay>>({
  day: { type: String, required: true, unique: true },
  questions: [QuestionSchema],
  source: { type: String, enum: ['ai', 'bank'], default: 'bank' },
});

const QuizAttemptSchema = new Schema<IQuizAttempt, Model<IQuizAttempt>>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  campus: { type: String, required: true },
  day: { type: String, required: true },
  answers: [{ type: Number }],
  score: { type: Number, required: true },
  completedAt: { type: Date, default: Date.now },
});
QuizAttemptSchema.index({ user: 1, day: 1 }, { unique: true });
QuizAttemptSchema.index({ campus: 1, day: 1, score: -1, completedAt: 1 });

export const QuizDay = (mongoose.models.QuizDay as Model<IQuizDay>) || mongoose.model<IQuizDay>('QuizDay', QuizDaySchema);
export const QuizAttempt = (mongoose.models.QuizAttempt as Model<IQuizAttempt>) || mongoose.model<IQuizAttempt>('QuizAttempt', QuizAttemptSchema);
