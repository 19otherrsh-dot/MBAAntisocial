import mongoose, { Schema, type Model, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import {
  USER_ROLES,
  SESSION_TYPES,
  type SessionType,
  type UserRole,
} from '@/lib/constants';

/** Running average, stored denormalised so profiles never aggregate at read time. */
export interface RatingSummary {
  sum: number;
  count: number;
}

export interface MentorProfile {
  /** Whether the user currently accepts bookings at all. */
  acceptingBookings: boolean;
  /** Session types this mentor offers. */
  offers: SessionType[];
  /** Upper bound on live bookings — the §11 burnout guard, set by the mentor. */
  weeklyCapacity: number;
  /** Free-text on what they are actually useful for. */
  headline: string;
  companies: string[];
}

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  image?: string;

  campus: string;
  batch: string;
  year: 1 | 2;
  role: UserRole;

  bio: string;
  specializations: string[];
  mentorProfile: MentorProfile;

  /** Personal-productivity ledger. */
  points: number;
  /** Contribution ledger — kept separate on purpose (§6.3). */
  karma: number;
  streak: number;
  longestStreak: number;
  lastCheckInAt?: Date;
  badges: string[];

  /** Ratings received while hosting. */
  mentorRating: RatingSummary;
  /** Ratings received while attending. */
  menteeRating: RatingSummary;
  sessionsHosted: number;
  sessionsAttended: number;
  lateCancellations: number;
  noShows: number;

  /** §6.3 — ranking is opt-in, never imposed. */
  leaderboardOptIn: boolean;
  notificationPrefs: {
    sessionReminders: boolean;
    deadlineReminders: boolean;
    feedComments: boolean;
    digest: boolean;
  };

  /** §6.5 — recorded before a user can contribute or download resources. */
  honorCodeAcceptedAt?: Date;
  onboardedAt?: Date;
  suspendedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type UserModel = Model<IUser, object, IUserMethods>;

const ratingSummary = {
  sum: { type: Number, default: 0, min: 0 },
  count: { type: Number, default: 0, min: 0 },
};

const UserSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // `select: false` so a stray `.find()` can never leak hashes into a response.
    password: { type: String, select: false },
    image: { type: String, default: '' },

    campus: { type: String, required: true, trim: true },
    batch: { type: String, required: true, trim: true },
    year: { type: Number, enum: [1, 2], required: true },
    role: { type: String, enum: USER_ROLES, default: 'student' },

    bio: { type: String, default: '', maxlength: 500 },
    specializations: [{ type: String, trim: true, maxlength: 40 }],

    mentorProfile: {
      acceptingBookings: { type: Boolean, default: false },
      offers: [{ type: String, enum: SESSION_TYPES }],
      weeklyCapacity: { type: Number, default: 3, min: 0, max: 20 },
      headline: { type: String, default: '', maxlength: 160 },
      companies: [{ type: String, trim: true, maxlength: 60 }],
    },

    points: { type: Number, default: 0, min: 0 },
    karma: { type: Number, default: 0, min: 0 },
    streak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastCheckInAt: { type: Date },
    badges: [{ type: String }],

    mentorRating: ratingSummary,
    menteeRating: ratingSummary,
    sessionsHosted: { type: Number, default: 0, min: 0 },
    sessionsAttended: { type: Number, default: 0, min: 0 },
    lateCancellations: { type: Number, default: 0, min: 0 },
    noShows: { type: Number, default: 0, min: 0 },

    leaderboardOptIn: { type: Boolean, default: false },
    notificationPrefs: {
      sessionReminders: { type: Boolean, default: true },
      deadlineReminders: { type: Boolean, default: true },
      feedComments: { type: Boolean, default: true },
      digest: { type: Boolean, default: false },
    },

    honorCodeAcceptedAt: { type: Date },
    onboardedAt: { type: Date },
    suspendedAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

UserSchema.methods.comparePassword = async function comparePassword(candidate: string) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

/** Mean rating, or null when nobody has rated yet. */
export function averageRating(summary?: RatingSummary): number | null {
  if (!summary || summary.count === 0) return null;
  return Math.round((summary.sum / summary.count) * 10) / 10;
}

// Leaderboard reads: campus + opted-in, sorted by a ledger.
UserSchema.index({ campus: 1, leaderboardOptIn: 1, karma: -1 });
UserSchema.index({ campus: 1, leaderboardOptIn: 1, points: -1 });
// Mentor directory.
UserSchema.index({ campus: 1, 'mentorProfile.acceptingBookings': 1 });

const User =
  (mongoose.models.User as UserModel) ||
  mongoose.model<IUser, UserModel>('User', UserSchema);

export default User;
