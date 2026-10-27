import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { MEALS, type Meal } from './MessMenu';

export interface IMessRating {
  _id: Types.ObjectId;
  campus: string;
  mess: string;
  user: Types.ObjectId;
  day: string;
  meal: Meal;
  rating: number;
  comment: string;
}

type MessRatingModel = Model<IMessRating>;

const MessRatingSchema = new Schema<IMessRating, MessRatingModel>({
  campus: { type: String, required: true },
  mess: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  meal: { type: String, enum: MEALS, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', maxlength: 280 },
});

MessRatingSchema.index({ user: 1, mess: 1, day: 1, meal: 1 }, { unique: true });
MessRatingSchema.index({ campus: 1, mess: 1, day: 1, meal: 1 });

const MessRating = (mongoose.models.MessRating as MessRatingModel) || mongoose.model<IMessRating, MessRatingModel>('MessRating', MessRatingSchema);
export default MessRating;
