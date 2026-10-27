import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { ROUND_TYPES, SESSION_TYPES, type RoundType, type SessionType } from '@/lib/constants';

/**
 * A crowd-sourced mock template (§6.1 V2): "Consulting case — BCG-style", "FMCG
 * marketing PI". Written by people who sat the real thing, picked by juniors
 * at booking so the senior knows exactly what to run.
 */
export interface ISessionTemplate {
  _id: Types.ObjectId;
  campus: string;
  author: Types.ObjectId;
  title: string;
  company: string;
  roundType: RoundType;
  sessionType: SessionType;
  /** What the interviewer should ask or do, in order. */
  prompts: string[];
  /** What a strong answer looks like. */
  lookFor: string;
  upvotes: Types.ObjectId[];
  upvoteCount: number;
  uses: number;
  hiddenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type SessionTemplateModel = Model<ISessionTemplate>;

const SessionTemplateSchema = new Schema<ISessionTemplate, SessionTemplateModel>(
  {
    campus: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    company: { type: String, default: '', trim: true, maxlength: 80 },
    roundType: { type: String, enum: ROUND_TYPES, required: true },
    sessionType: { type: String, enum: SESSION_TYPES, required: true },
    prompts: [{ type: String, trim: true, maxlength: 400 }],
    lookFor: { type: String, default: '', maxlength: 1500 },
    upvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    upvoteCount: { type: Number, default: 0 },
    uses: { type: Number, default: 0 },
    hiddenAt: { type: Date },
  },
  { timestamps: true }
);

SessionTemplateSchema.index({ campus: 1, sessionType: 1, upvoteCount: -1 });
SessionTemplateSchema.index({ campus: 1, company: 1 });

const SessionTemplate =
  (mongoose.models.SessionTemplate as SessionTemplateModel) ||
  mongoose.model<ISessionTemplate, SessionTemplateModel>('SessionTemplate', SessionTemplateSchema);

export default SessionTemplate;
