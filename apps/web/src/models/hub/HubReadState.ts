import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** Where a person has read up to in a channel or conversation. */
export interface IHubReadState {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  target: Types.ObjectId;
  targetKind: 'channel' | 'conversation';
  lastReadAt: Date;
}

type HubReadStateModel = Model<IHubReadState>;

const HubReadStateSchema = new Schema<IHubReadState, HubReadStateModel>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  target: { type: Schema.Types.ObjectId, required: true },
  targetKind: { type: String, enum: ['channel', 'conversation'], required: true },
  lastReadAt: { type: Date, default: Date.now },
});

HubReadStateSchema.index({ user: 1, target: 1 }, { unique: true });

const HubReadState =
  (mongoose.models.HubReadState as HubReadStateModel) ||
  mongoose.model<IHubReadState, HubReadStateModel>('HubReadState', HubReadStateSchema);

export default HubReadState;
