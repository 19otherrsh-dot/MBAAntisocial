import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export type BountyCategory = 'subscription' | 'travel' | 'event' | 'other';
export type BountyStatus = 'open' | 'filled';

export interface IBounty {
  campus: string;
  owner: Types.ObjectId;
  title: string;
  description: string;
  totalCost: number;
  slotsRequired: number;
  slotsFilled: Types.ObjectId[];
  category: BountyCategory;
  status: BountyStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBountyDocument extends IBounty, Document {}

const BountySchema = new Schema<IBountyDocument>(
  {
    campus: { type: String, required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, maxlength: 100 },
    description: { type: String, maxlength: 1000, default: '' },
    totalCost: { type: Number, required: true, min: 0 },
    slotsRequired: { type: Number, required: true, min: 2 },
    slotsFilled: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    category: { type: String, enum: ['subscription', 'travel', 'event', 'other'], default: 'other' },
    status: { type: String, enum: ['open', 'filled'], default: 'open' },
  },
  { timestamps: true }
);

const Bounty: Model<IBountyDocument> =
  mongoose.models.Bounty || mongoose.model<IBountyDocument>('Bounty', BountySchema);

export default Bounty;
