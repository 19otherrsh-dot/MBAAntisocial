import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { POINT_RULES, type LedgerTrack } from '@/lib/constants';

/**
 * Append-only record of every points or karma award.
 *
 * Keeping the ledger separate from the running totals on `User` means a total
 * can always be reconstructed and audited, daily caps can be enforced by
 * counting rows, and an award can be reversed without guessing what it was.
 */
export interface ILedgerEntry {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  action: keyof typeof POINT_RULES;
  track: LedgerTrack;
  amount: number;

  /** What triggered it, for de-duplication and display. */
  entityType?: string;
  entity?: Types.ObjectId;

  /**
   * UTC calendar day as `YYYY-MM-DD`. Storing the bucket explicitly makes the
   * daily-cap count and the one-check-in-per-day guarantee an index lookup
   * rather than a date-range scan.
   */
  day: string;

  createdAt: Date;
}

type LedgerEntryModel = Model<ILedgerEntry>;

const LedgerEntrySchema = new Schema<ILedgerEntry, LedgerEntryModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    track: { type: String, enum: ['points', 'karma'], required: true },
    amount: { type: Number, required: true },

    entityType: { type: String, maxlength: 40 },
    entity: { type: Schema.Types.ObjectId },

    day: { type: String, required: true, maxlength: 10 },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Daily-cap counting.
LedgerEntrySchema.index({ user: 1, action: 1, day: 1 });
// Activity history on the profile.
LedgerEntrySchema.index({ user: 1, createdAt: -1 });
/**
 * Stops the same entity paying out twice — re-upvoting a resource after
 * un-upvoting it, or a booking flow retried by a double-click. Partial so
 * entries without an entity (daily check-in) are unaffected.
 */
LedgerEntrySchema.index(
  { user: 1, action: 1, entity: 1 },
  { unique: true, partialFilterExpression: { entity: { $exists: true } } }
);

const LedgerEntry =
  (mongoose.models.LedgerEntry as LedgerEntryModel) ||
  mongoose.model<ILedgerEntry, LedgerEntryModel>('LedgerEntry', LedgerEntrySchema);

export default LedgerEntry;
