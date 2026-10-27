import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** An invite code for an invite-only or request-to-join server. */
export interface IHubInvite {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  code: string;
  createdBy: Types.ObjectId;
  uses: number;
  maxUses: number;
  expiresAt?: Date;
  createdAt: Date;
}

type HubInviteModel = Model<IHubInvite>;

const HubInviteSchema = new Schema<IHubInvite, HubInviteModel>(
  {
    server: { type: Schema.Types.ObjectId, ref: 'HubServer', required: true },
    code: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uses: { type: Number, default: 0 },
    maxUses: { type: Number, default: 0 },
    expiresAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

HubInviteSchema.index({ code: 1 }, { unique: true });
HubInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const HubInvite =
  (mongoose.models.HubInvite as HubInviteModel) || mongoose.model<IHubInvite, HubInviteModel>('HubInvite', HubInviteSchema);

export default HubInvite;
