import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export type ContactStatus = 'cold' | 'warm' | 'advocate';

export interface IContact {
  owner: Types.ObjectId;
  campus: string;
  name: string;
  company: string;
  role: string;
  status: ContactStatus;
  lastContactedAt: Date;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IContactDocument extends IContact, Document {}

const ContactSchema = new Schema<IContactDocument>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    campus: { type: String, required: true, index: true },
    name: { type: String, required: true, maxlength: 100 },
    company: { type: String, required: true, maxlength: 100 },
    role: { type: String, required: true, maxlength: 100 },
    status: { type: String, enum: ['cold', 'warm', 'advocate'], default: 'cold' },
    lastContactedAt: { type: Date, default: Date.now },
    notes: { type: String, maxlength: 2000, default: '' },
  },
  { timestamps: true }
);

const Contact: Model<IContactDocument> =
  mongoose.models.Contact || mongoose.model<IContactDocument>('Contact', ContactSchema);

export default Contact;
