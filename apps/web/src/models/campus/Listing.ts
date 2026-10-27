import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const LISTING_CATEGORIES = ['books', 'electronics', 'cycles', 'furniture', 'clothing', 'sublet', 'tickets', 'other'] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

/** Something for sale (or free) within campus. Posting it opts the seller in to contact. */
export interface IListing {
  _id: Types.ObjectId;
  campus: string;
  seller: Types.ObjectId;
  title: string;
  description: string;
  category: ListingCategory;
  /** 0 = free. */
  price: number;
  negotiable: boolean;
  condition: 'new' | 'like-new' | 'good' | 'fair';
  images: string[];
  status: 'active' | 'reserved' | 'sold' | 'removed';
  interested: Types.ObjectId[];
  boostedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type ListingModel = Model<IListing>;

const ListingSchema = new Schema<IListing, ListingModel>(
  {
    campus: { type: String, required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 2000 },
    category: { type: String, enum: LISTING_CATEGORIES, default: 'other' },
    price: { type: Number, default: 0, min: 0, max: 10_000_000 },
    negotiable: { type: Boolean, default: true },
    condition: { type: String, enum: ['new', 'like-new', 'good', 'fair'], default: 'good' },
    images: [{ type: String, maxlength: 500 }],
    status: { type: String, enum: ['active', 'reserved', 'sold', 'removed'], default: 'active' },
    interested: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    boostedUntil: { type: Date },
  },
  { timestamps: true }
);

ListingSchema.index({ campus: 1, status: 1, boostedUntil: -1, createdAt: -1 });
ListingSchema.index({ seller: 1, status: 1 });

const Listing = (mongoose.models.Listing as ListingModel) || mongoose.model<IListing, ListingModel>('Listing', ListingSchema);
export default Listing;
