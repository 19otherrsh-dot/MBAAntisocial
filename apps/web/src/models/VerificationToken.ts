import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const TOKEN_PURPOSES = ['verify_email', 'reset_password', 'login_code'] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

/**
 * Single-use secrets: verification links, reset links, and sign-in codes.
 * Only a keyed hash is stored, so a database leak yields nothing usable, and a
 * TTL index removes rows once they expire.
 */
export interface IVerificationToken {
  _id: Types.ObjectId;
  email: string;
  user?: Types.ObjectId;
  purpose: TokenPurpose;
  tokenHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
}

type VerificationTokenModel = Model<IVerificationToken>;

const VerificationTokenSchema = new Schema<IVerificationToken, VerificationTokenModel>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    purpose: { type: String, enum: TOKEN_PURPOSES, required: true },
    tokenHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

VerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
VerificationTokenSchema.index({ tokenHash: 1, purpose: 1 });
VerificationTokenSchema.index({ email: 1, purpose: 1, createdAt: -1 });

const VerificationToken =
  (mongoose.models.VerificationToken as VerificationTokenModel) ||
  mongoose.model<IVerificationToken, VerificationTokenModel>('VerificationToken', VerificationTokenSchema);

export default VerificationToken;
