import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface IHubRole {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  name: string;
  color: string;
  /** Bitset of `PERMISSIONS` from @mba/shared/hub. */
  permissions: number;
  /** Higher sorts above; a member manages only roles below their highest. */
  position: number;
  /** Shown as its own group in the member list. */
  hoist: boolean;
  mentionable: boolean;
  /** `@everyone`, which cannot be deleted or renamed. */
  isEveryone: boolean;
  /** Assigned automatically from platform roles (e.g. campus moderators). */
  managedBy: '' | 'campus_moderators' | 'seniors';
  createdAt: Date;
}

type HubRoleModel = Model<IHubRole>;

const HubRoleSchema = new Schema<IHubRole, HubRoleModel>(
  {
    server: { type: Schema.Types.ObjectId, ref: 'HubServer', required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    color: { type: String, default: '', maxlength: 7 },
    permissions: { type: Number, default: 0 },
    position: { type: Number, default: 0 },
    hoist: { type: Boolean, default: false },
    mentionable: { type: Boolean, default: false },
    isEveryone: { type: Boolean, default: false },
    managedBy: { type: String, enum: ['', 'campus_moderators', 'seniors'], default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

HubRoleSchema.index({ server: 1, position: -1 });

const HubRole = (mongoose.models.HubRole as HubRoleModel) || mongoose.model<IHubRole, HubRoleModel>('HubRole', HubRoleSchema);

export default HubRole;
