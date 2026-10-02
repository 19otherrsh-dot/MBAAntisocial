import mongoose, { Schema, type Model, type Types } from 'mongoose';
import {
  APPLICATION_STAGES,
  APPLICATION_SOURCES,
  ROLE_TRACKS,
  ROUND_TYPES,
  ROUND_OUTCOMES,
  type ApplicationStage,
  type ApplicationSource,
  type RoleTrack,
  type RoundType,
  type RoundOutcome,
} from '@/lib/constants';

/**
 * One round inside a process.
 *
 * Embedded rather than a separate collection: rounds are never queried
 * independently of their application, always read together with it, and are
 * bounded at a handful per process. A join here would buy nothing.
 */
export interface IRound {
  _id: Types.ObjectId;
  type: RoundType;
  /** Free-text override, e.g. "Partner round" for a `final`. */
  label: string;
  scheduledAt?: Date;
  outcome: RoundOutcome;
  /** Private reflection — never leaves the owner. */
  notes: string;
  /** Set once the owner has been asked for intel, so they are asked only once. */
  intelPromptedAt?: Date;
  /** Number of questions the owner contributed from this round. */
  questionsLogged: number;
  /** A mock booked specifically to prepare for this round. */
  practiceSlot?: Types.ObjectId;
  completedAt?: Date;
}

export interface IApplication {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  campus: string;

  /** Stored normalised so "McKinsey & Co." and "mckinsey & co" aggregate together. */
  company: string;
  companyKey: string;
  role: string;
  track: RoleTrack;
  source: ApplicationSource;

  stage: ApplicationStage;
  rounds: IRound[];

  appliedAt?: Date;
  closedAt?: Date;
  /** Private. Never aggregated or exposed — see the outcome note below. */
  notes: string;

  createdAt: Date;
  updatedAt: Date;
}

type ApplicationModel = Model<IApplication>;

/**
 * Company names are user-typed, so the same employer arrives a dozen ways.
 * Normalising to a key lets the intel bank aggregate across everyone who typed
 * it differently without forcing an autocomplete-only field on the student.
 */
/**
 * Explicit wire shape for a round.
 *
 * Mapping the fields by hand rather than dumping the subdocument keeps the
 * response contract visible in one place, and means a field added to the schema
 * for internal bookkeeping is not published by accident.
 */
export function serialiseRound(round: IRound) {
  return {
    _id: String(round._id),
    type: round.type,
    label: round.label,
    scheduledAt: round.scheduledAt ?? null,
    outcome: round.outcome,
    notes: round.notes,
    intelPromptedAt: round.intelPromptedAt ?? null,
    questionsLogged: round.questionsLogged,
    completedAt: round.completedAt ?? null,
  };
}

export function companyKeyOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(pvt|private|ltd|limited|inc|llp|llc|co|company|group|india)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

const RoundSchema = new Schema<IRound>(
  {
    type: { type: String, enum: ROUND_TYPES, required: true },
    label: { type: String, default: '', trim: true, maxlength: 80 },
    scheduledAt: { type: Date },
    outcome: { type: String, enum: ROUND_OUTCOMES, default: 'pending' },
    notes: { type: String, default: '', maxlength: 2000 },
    intelPromptedAt: { type: Date },
    questionsLogged: { type: Number, default: 0, min: 0 },
    practiceSlot: { type: Schema.Types.ObjectId, ref: 'InterviewSlot' },
    completedAt: { type: Date },
  },
  { _id: true }
);

const ApplicationSchema = new Schema<IApplication, ApplicationModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    campus: { type: String, required: true },

    company: { type: String, required: true, trim: true, maxlength: 120 },
    companyKey: { type: String, required: true, index: true },
    role: { type: String, required: true, trim: true, maxlength: 120 },
    track: { type: String, enum: ROLE_TRACKS, default: 'general_management' },
    source: { type: String, enum: APPLICATION_SOURCES, default: 'campus' },

    stage: { type: String, enum: APPLICATION_STAGES, default: 'interested' },
    rounds: { type: [RoundSchema], default: [] },

    appliedAt: { type: Date },
    closedAt: { type: Date },
    notes: { type: String, default: '', maxlength: 2000 },
  },
  { timestamps: true }
);

ApplicationSchema.pre('validate', function normaliseCompany() {
  if (this.isModified('company')) this.companyKey = companyKeyOf(this.company);
});

/*
 * A pipeline is private by construction. There is no campus-wide read path for
 * applications and no index supporting one: who applied where, and who got
 * rejected, is the most sensitive data in the product. Only the aggregate
 * question bank is shared, and that is a separate collection contributed to
 * deliberately.
 */
ApplicationSchema.index({ user: 1, stage: 1, updatedAt: -1 });
ApplicationSchema.index({ user: 1, 'rounds.scheduledAt': 1 });
// Prevents the same company/role being tracked twice by one person.
ApplicationSchema.index({ user: 1, companyKey: 1, role: 1 }, { unique: true });

const Application =
  (mongoose.models.Application as ApplicationModel) ||
  mongoose.model<IApplication, ApplicationModel>('Application', ApplicationSchema);

export default Application;
