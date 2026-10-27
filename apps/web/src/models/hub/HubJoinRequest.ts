import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** A request to join a `request`-visibility server, approved by its managers. */
export interface IHubJoinRequest {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  user: Types.ObjectId;
  note: string;
  createdAt: Date;
}

type HubJoinRequestModel = Model<IHubJoinRequest>;

const HubJoinRequestSchema = new Schema<IHubJoinRequest, HubJoinRequestModel>(
  {
    server: { type: Schema.Types.ObjectId, ref: 'HubServer', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

HubJoinRequestSchema.index({ server: 1, user: 1 }, { unique: true });

const HubJoinRequest =
  (mongoose.models.HubJoinRequest as HubJoinRequestModel) ||
  mongoose.model<IHubJoinRequest, HubJoinRequestModel>('HubJoinRequest', HubJoinRequestSchema);

export default HubJoinRequest;
