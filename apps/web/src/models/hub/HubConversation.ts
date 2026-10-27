import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** A direct-message conversation: two people, or a small group. */
export interface IHubConversation {
  _id: Types.ObjectId;
  campus: string;
  participants: Types.ObjectId[];
  /** Sorted participant ids, for "does a DM with exactly these people exist?". */
  key: string;
  kind: 'dm' | 'group';
  name: string;
  createdBy: Types.ObjectId;
  lastMessageAt?: Date;
  lastMessagePreview: string;
  createdAt: Date;
}

type HubConversationModel = Model<IHubConversation>;

const HubConversationSchema = new Schema<IHubConversation, HubConversationModel>(
  {
    campus: { type: String, required: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    key: { type: String, required: true },
    kind: { type: String, enum: ['dm', 'group'], default: 'dm' },
    name: { type: String, default: '', maxlength: 60 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String, default: '', maxlength: 140 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

HubConversationSchema.index({ key: 1 }, { unique: true, partialFilterExpression: { kind: 'dm' } });
HubConversationSchema.index({ participants: 1, lastMessageAt: -1 });

const HubConversation =
  (mongoose.models.HubConversation as HubConversationModel) ||
  mongoose.model<IHubConversation, HubConversationModel>('HubConversation', HubConversationSchema);

export default HubConversation;
