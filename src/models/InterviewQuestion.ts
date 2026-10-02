import mongoose, { Schema, type Model, type Types } from 'mongoose';
import {
  ROUND_TYPES,
  ROLE_TRACKS,
  QUESTION_DIFFICULTIES,
  type RoundType,
  type RoleTrack,
  type QuestionDifficulty,
} from '@/lib/constants';

/**
 * A question a panel actually asked, logged by the person who was asked it.
 *
 * This is the compounding asset: it is contributed once, by someone with
 * first-hand knowledge, and stays useful to every subsequent batch. A generic
 * marketplace cannot build the equivalent, because its users are spread across
 * every institute — density for any one company at any one campus is what makes
 * this worth reading, and density is exactly what campus scoping produces.
 */
export interface IInterviewQuestion {
  _id: Types.ObjectId;
  /** Who logged it. Attribution is on by default — see `anonymous` below. */
  contributor: Types.ObjectId;
  campus: string;

  company: string;
  companyKey: string;
  role: string;
  track: RoleTrack;
  roundType: RoundType;

  question: string;
  /** What the contributor wishes they had said. Optional; often the best part. */
  guidance: string;
  difficulty: QuestionDifficulty;
  tags: string[];

  /**
   * When it was asked — the placement season, not the logging date. Patterns
   * drift, so a reader needs to know whether this is from last December or the
   * one before.
   */
  askedAt: Date;

  /**
   * Hides the contributor's name on this entry only.
   *
   * The narrow exception to the no-anonymity rule (§11): a rejection is
   * disclosed by the act of logging, and requiring a name on it would simply
   * stop people contributing the most useful entries. The contributor id is
   * still stored, so moderation and karma both still work — this hides a name,
   * it does not create an unaccountable posting channel.
   */
  anonymous: boolean;

  /** Provenance: the round this came from, if it was logged through the pipeline. */
  sourceApplication?: Types.ObjectId;
  sourceRound?: Types.ObjectId;
  /** True when logged from a tracked round rather than typed in freehand. */
  verified: boolean;

  upvotes: Types.ObjectId[];
  upvoteCount: number;

  hiddenAt?: Date;
  hiddenBy?: Types.ObjectId;
  hiddenReason: string;

  createdAt: Date;
  updatedAt: Date;
}

type InterviewQuestionModel = Model<IInterviewQuestion>;

const InterviewQuestionSchema = new Schema<IInterviewQuestion, InterviewQuestionModel>(
  {
    contributor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    campus: { type: String, required: true },

    company: { type: String, required: true, trim: true, maxlength: 120 },
    companyKey: { type: String, required: true },
    role: { type: String, default: '', trim: true, maxlength: 120 },
    track: { type: String, enum: ROLE_TRACKS, default: 'general_management' },
    roundType: { type: String, enum: ROUND_TYPES, required: true },

    question: { type: String, required: true, trim: true, minlength: 8, maxlength: 1000 },
    guidance: { type: String, default: '', maxlength: 2000 },
    difficulty: { type: String, enum: QUESTION_DIFFICULTIES, default: 'standard' },
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],

    askedAt: { type: Date, required: true },
    anonymous: { type: Boolean, default: false },

    sourceApplication: { type: Schema.Types.ObjectId, ref: 'Application' },
    sourceRound: { type: Schema.Types.ObjectId },
    verified: { type: Boolean, default: false },

    upvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    upvoteCount: { type: Number, default: 0, min: 0 },

    hiddenAt: { type: Date },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    hiddenReason: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

// The main read path: everything known about one company at one campus.
InterviewQuestionSchema.index({ campus: 1, companyKey: 1, askedAt: -1 });
// Browsing a role family across companies.
InterviewQuestionSchema.index({ campus: 1, track: 1, upvoteCount: -1 });
// The contributor's own entries, and the count behind their badges.
InterviewQuestionSchema.index({ contributor: 1, createdAt: -1 });
InterviewQuestionSchema.index(
  { question: 'text', guidance: 'text', company: 'text', tags: 'text' },
  { weights: { question: 10, company: 6, tags: 4, guidance: 1 }, name: 'question_search' }
);

const InterviewQuestion =
  (mongoose.models.InterviewQuestion as InterviewQuestionModel) ||
  mongoose.model<IInterviewQuestion, InterviewQuestionModel>(
    'InterviewQuestion',
    InterviewQuestionSchema
  );

export default InterviewQuestion;
