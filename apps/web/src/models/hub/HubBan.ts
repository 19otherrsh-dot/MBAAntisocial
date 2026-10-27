import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface IHubBan {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  user: Types.ObjectId;
  by: Types.ObjectId;
  reason: string;
  createdAt: Date;
}

type HubBanModel = Model<IHubBan>;

const HubBanSchema = new Schema<IHubBan, HubBanModel>(
  {
    server: { type: Schema.Types.ObjectId, ref: 'HubServer', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

HubBanSchema.index({ server: 1, user: 1 }, { unique: true });

const HubBan = (mongoose.models.HubBan as HubBanModel) || mongoose.model<IHubBan, HubBanModel>('HubBan', HubBanSchema);

export default HubBan;
