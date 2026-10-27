import mongoose, { Schema, type Model, type Types } from 'mongoose';
import {
  OPPORTUNITY_KINDS,
  COMMITMENT_LEVELS,
  type OpportunityKind,
  type CommitmentLevel,
} from '@/lib/constants';

/**
 * A campus opportunity.
 *
 * Narrowed from a general job board on purpose. Competing on external listings
 * means competing with national marketplaces without their employer
 * relationships, and an empty listings page is the single most damaging screen
 * a small platform can show. What is here instead is supply that already exists
 * on a campus — club recruitment, TA positions, live projects, student ventures
 * — plus alumni referrals, which are a person from your own school rather than
 * a listing anyone can scrape.
 *
 * The collection keeps its `Job` name to avoid a migration; the domain concept
 * is an opportunity.
 */
export interface IJob {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  campus: string;

  title: string;
  kind: OpportunityKind;
  /** Only meaningful for kinds where an external org applies. */
  org: string;
  description: string;
  commitment: CommitmentLevel;
  /** Optional supporting link — a form, a JD, a club page. */
  link: string;

  /**
   * The poster is happy to be contacted directly about this.
   *
   * Doubles as an explicit consent signal for the messaging gate: posting a
   * referral offer *is* opting in to being messaged about it, so honouring it
   * there is not a loophole in the gate but the point of it.
   */
  invitesContact: boolean;

  closesAt?: Date;
  isActive: boolean;

  hiddenAt?: Date;
  hiddenBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

type JobModel = Model<IJob>;

const JobSchema = new Schema<IJob, JobModel>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    campus: { type: String, required: true },

    title: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, enum: OPPORTUNITY_KINDS, default: 'club_role' },
    org: { type: String, default: '', trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    commitment: { type: String, enum: COMMITMENT_LEVELS, default: 'moderate' },
    link: { type: String, default: '', trim: true, maxlength: 2000 },

    invitesContact: { type: Boolean, default: true },

    closesAt: { type: Date },
    isActive: { type: Boolean, default: true },

    hiddenAt: { type: Date },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/*
 * Campus-scoped like everything else. The previous version stored a campus but
 * published globally, which recreated exactly the strangers-and-noise problem
 * that makes a national board hard to trust.
 */
JobSchema.index({ campus: 1, isActive: 1, createdAt: -1 });
JobSchema.index({ author: 1, isActive: 1 });

const Job = (mongoose.models.Job as JobModel) || mongoose.model<IJob, JobModel>('Job', JobSchema);

export default Job;
