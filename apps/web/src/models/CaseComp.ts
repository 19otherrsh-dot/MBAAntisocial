import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { COMP_CATEGORIES, type CompCategory } from '@/lib/constants';

/**
 * An external case competition or hackathon.
 *
 * §6.4 MVP is a manually curated calendar, so entries are seeded or added by
 * moderators; `source` and `sourceUrl` are already here so the V3+ scraper can
 * write to the same collection without a schema change.
 */
export interface ICaseComp {
  _id: Types.ObjectId;
  title: string;
  host: string;
  description: string;
  category: CompCategory;

  registrationDeadline: Date;
  eventDate?: Date;

  prizePool: string;
  teamSize: string;
  eligibility: string;

  url: string;
  source: 'curated' | 'partner' | 'imported';
  sourceUrl: string;

  /** Empty means visible to every campus. */
  campuses: string[];
  /** Users tracking this comp — drives reminders and the saved list. */
  savedBy: Types.ObjectId[];

  addedBy?: Types.ObjectId;
  archivedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

type CaseCompModel = Model<ICaseComp>;

const CaseCompSchema = new Schema<ICaseComp, CaseCompModel>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    host: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    category: { type: String, enum: COMP_CATEGORIES, default: 'general' },

    registrationDeadline: { type: Date, required: true },
    eventDate: { type: Date },

    prizePool: { type: String, default: '', maxlength: 80 },
    teamSize: { type: String, default: '', maxlength: 40 },
    eligibility: { type: String, default: '', maxlength: 300 },

    url: { type: String, required: true, maxlength: 2000 },
    source: { type: String, enum: ['curated', 'partner', 'imported'], default: 'curated' },
    sourceUrl: { type: String, default: '', maxlength: 2000 },

    campuses: [{ type: String, trim: true }],
    savedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    addedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    archivedAt: { type: Date },
  },
  { timestamps: true }
);

// Calendar view: upcoming deadlines first.
CaseCompSchema.index({ archivedAt: 1, registrationDeadline: 1 });
CaseCompSchema.index({ category: 1, registrationDeadline: 1 });
CaseCompSchema.index({ savedBy: 1 });

const CaseComp =
  (mongoose.models.CaseComp as CaseCompModel) ||
  mongoose.model<ICaseComp, CaseCompModel>('CaseComp', CaseCompSchema);

export default CaseComp;
