import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { CAMPUS_STATUSES, type CampusStatus } from '@mba/shared/campus';

/**
 * An institute on the platform.
 *
 * `name` is the key every campus-scoped document already stores (`campus:
 * "IIM Ahmedabad"`), so the registry slots in without a migration. `domains`
 * is the membership rule: an address on one of them, or a subdomain of one,
 * belongs to this campus.
 */
export interface ICampus {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  shortName: string;
  domains: string[];
  city: string;
  country: string;
  website: string;
  logo: string;
  status: CampusStatus;

  requestedBy?: Types.ObjectId;
  requestNote: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  unlockedAt?: Date;
  suspendedReason: string;

  settings: {
    /** Students here may book mentors from other campuses who opted in. */
    crossCampusMentors: boolean;
    /** Feed posts may be shared to the cross-campus layer. */
    crossCampusFeed: boolean;
    /** Anonymous course/professor reviews (moderated). */
    whispers: boolean;
    games: boolean;
    /** Linked Discord server, for the hub bridge. */
    discordGuildId: string;
  };

  /** Shown on the wellbeing page. Students reach their own campus's support first. */
  support: {
    counsellorName: string;
    counsellorContact: string;
    hours: string;
    bookingUrl: string;
    emergencyContact: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

type CampusModel = Model<ICampus>;

const CampusSchema = new Schema<ICampus, CampusModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120, unique: true },
    slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
    shortName: { type: String, default: '', trim: true, maxlength: 24 },
    domains: [{ type: String, trim: true, lowercase: true }],
    city: { type: String, default: '', trim: true, maxlength: 80 },
    country: { type: String, default: 'India', trim: true, maxlength: 60 },
    website: { type: String, default: '', trim: true, maxlength: 300 },
    logo: { type: String, default: '', trim: true, maxlength: 500 },
    status: { type: String, enum: CAMPUS_STATUSES, default: 'requested' },

    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    requestNote: { type: String, default: '', maxlength: 500 },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    unlockedAt: { type: Date },
    suspendedReason: { type: String, default: '', maxlength: 500 },

    settings: {
      crossCampusMentors: { type: Boolean, default: true },
      crossCampusFeed: { type: Boolean, default: false },
      whispers: { type: Boolean, default: true },
      games: { type: Boolean, default: true },
      discordGuildId: { type: String, default: '' },
    },
    support: {
      counsellorName: { type: String, default: '', maxlength: 100 },
      counsellorContact: { type: String, default: '', maxlength: 200 },
      hours: { type: String, default: '', maxlength: 100 },
      bookingUrl: { type: String, default: '', maxlength: 300 },
      emergencyContact: { type: String, default: '', maxlength: 200 },
    },
  },
  { timestamps: true }
);

// Membership lookup: "which campus owns this domain?"
CampusSchema.index({ domains: 1 });
CampusSchema.index({ status: 1, name: 1 });

const Campus = (mongoose.models.Campus as CampusModel) || mongoose.model<ICampus, CampusModel>('Campus', CampusSchema);

export default Campus;
