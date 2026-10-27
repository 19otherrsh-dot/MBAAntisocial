import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface ILostItem {
  _id: Types.ObjectId;
  campus: string;
  reporter: Types.ObjectId;
  kind: 'lost' | 'found';
  title: string;
  description: string;
  location: string;
  /** When it was lost or found. */
  when: Date;
  image: string;
  status: 'open' | 'resolved';
  createdAt: Date;
}

type LostItemModel = Model<ILostItem>;

const LostItemSchema = new Schema<ILostItem, LostItemModel>(
  {
    campus: { type: String, required: true },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['lost', 'found'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 1000 },
    location: { type: String, default: '', trim: true, maxlength: 100 },
    when: { type: Date, default: Date.now },
    image: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LostItemSchema.index({ campus: 1, status: 1, createdAt: -1 });

const LostItem = (mongoose.models.LostItem as LostItemModel) || mongoose.model<ILostItem, LostItemModel>('LostItem', LostItemSchema);
export default LostItem;
