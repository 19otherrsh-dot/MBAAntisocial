import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const CREDIT_REASONS = [
  'session_hosted',
  'gd_moderated',
  'referral_given',
  'admin_grant',
  'referral_priority',
  'listing_boost',
  'priority_booking',
] as const;
export type CreditReason = (typeof CREDIT_REASONS)[number];

/**
 * Append-only credit ledger (§6.1 V2, §6.3 V2). Credits are earned by giving
 * time and spent on perks — they are a currency, not a score, and are never
 * ranked. The unique index makes an earn for the same entity a no-op.
 */
export interface ICreditTransaction {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  amount: number;
  reason: CreditReason;
  entity?: Types.ObjectId;
  note: string;
  createdAt: Date;
}

type CreditTransactionModel = Model<ICreditTransaction>;

const CreditTransactionSchema = new Schema<ICreditTransaction, CreditTransactionModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    reason: { type: String, enum: CREDIT_REASONS, required: true },
    entity: { type: Schema.Types.ObjectId },
    note: { type: String, default: '', maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CreditTransactionSchema.index({ user: 1, createdAt: -1 });
CreditTransactionSchema.index(
  { user: 1, reason: 1, entity: 1 },
  { unique: true, partialFilterExpression: { entity: { $exists: true } } }
);

const CreditTransaction =
  (mongoose.models.CreditTransaction as CreditTransactionModel) ||
  mongoose.model<ICreditTransaction, CreditTransactionModel>('CreditTransaction', CreditTransactionSchema);

export default CreditTransaction;
