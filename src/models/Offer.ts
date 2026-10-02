import mongoose, { Document, Schema, Model } from 'mongoose';
import { ROLE_TRACKS, RoleTrack } from '@/lib/constants';

export interface IOffer {
  campus: string;
  company: string;
  role: string;
  location: string;
  baseSalary: number;
  signingBonus: number;
  offerType: 'internship' | 'full_time';
  track: RoleTrack;
  createdAt: Date;
}

export interface IOfferDocument extends IOffer, Document {}

const OfferSchema = new Schema<IOfferDocument>(
  {
    campus: { type: String, required: true, index: true },
    company: { type: String, required: true, maxlength: 100 },
    role: { type: String, required: true, maxlength: 100 },
    location: { type: String, required: true, maxlength: 100 },
    baseSalary: { type: Number, required: true, min: 0 },
    signingBonus: { type: Number, default: 0, min: 0 },
    offerType: { type: String, required: true, enum: ['internship', 'full_time'] },
    track: { type: String, required: true, enum: ROLE_TRACKS, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } } // We don't need updatedAt for immutable anonymous reports
);

const Offer: Model<IOfferDocument> =
  mongoose.models.Offer || mongoose.model<IOfferDocument>('Offer', OfferSchema);

export default Offer;
