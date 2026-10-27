import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const EXTERNAL_PROVIDERS = ['google_calendar', 'zoom', 'discord', 'linkedin'] as const;
export type ExternalProvider = (typeof EXTERNAL_PROVIDERS)[number];

/**
 * A third-party account a user has connected for an integration (not for
 * sign-in). Tokens are encrypted at rest and never selected by default.
 */
export interface IExternalAccount {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  provider: ExternalProvider;
  accountId: string;
  accountEmail: string;
  accountName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt?: Date;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
}

type ExternalAccountModel = Model<IExternalAccount>;

const ExternalAccountSchema = new Schema<IExternalAccount, ExternalAccountModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, enum: EXTERNAL_PROVIDERS, required: true },
    accountId: { type: String, default: '' },
    accountEmail: { type: String, default: '' },
    accountName: { type: String, default: '' },
    accessToken: { type: String, default: '', select: false },
    refreshToken: { type: String, default: '', select: false },
    expiresAt: { type: Date },
    scopes: [{ type: String }],
  },
  { timestamps: true }
);

ExternalAccountSchema.index({ user: 1, provider: 1 }, { unique: true });
ExternalAccountSchema.index({ provider: 1, accountId: 1 });

const ExternalAccount =
  (mongoose.models.ExternalAccount as ExternalAccountModel) ||
  mongoose.model<IExternalAccount, ExternalAccountModel>('ExternalAccount', ExternalAccountSchema);

export default ExternalAccount;
