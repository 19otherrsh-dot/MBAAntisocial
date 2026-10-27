import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface IClubApplication {
  _id: Types.ObjectId;
  club: Types.ObjectId;
  user: Types.ObjectId;
  answers: string[];
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  reviewedBy?: Types.ObjectId;
  createdAt: Date;
}

type ClubApplicationModel = Model<IClubApplication>;

const ClubApplicationSchema = new Schema<IClubApplication, ClubApplicationModel>(
  {
    club: { type: Schema.Types.ObjectId, ref: 'Club', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    answers: [{ type: String, maxlength: 2000 }],
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'withdrawn'], default: 'pending' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ClubApplicationSchema.index({ club: 1, user: 1 }, { unique: true });
ClubApplicationSchema.index({ club: 1, status: 1 });

const ClubApplication =
  (mongoose.models.ClubApplication as ClubApplicationModel) || mongoose.model<IClubApplication, ClubApplicationModel>('ClubApplication', ClubApplicationSchema);
export default ClubApplication;
