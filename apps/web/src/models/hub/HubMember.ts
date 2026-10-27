import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface IHubMember {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  user: Types.ObjectId;
  roles: Types.ObjectId[];
  nickname: string;
  /** Read-only until this time (moderator timeout). */
  timedOutUntil?: Date;
  /** Per-server notification level. */
  notify: 'all' | 'mentions' | 'none';
  joinedAt: Date;
}

type HubMemberModel = Model<IHubMember>;

const HubMemberSchema = new Schema<IHubMember, HubMemberModel>({
  server: { type: Schema.Types.ObjectId, ref: 'HubServer', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  roles: [{ type: Schema.Types.ObjectId, ref: 'HubRole' }],
  nickname: { type: String, default: '', maxlength: 40 },
  timedOutUntil: { type: Date },
  notify: { type: String, enum: ['all', 'mentions', 'none'], default: 'mentions' },
  joinedAt: { type: Date, default: Date.now },
});

HubMemberSchema.index({ server: 1, user: 1 }, { unique: true });
HubMemberSchema.index({ user: 1 });
HubMemberSchema.index({ server: 1, joinedAt: 1 });

const HubMember =
  (mongoose.models.HubMember as HubMemberModel) || mongoose.model<IHubMember, HubMemberModel>('HubMember', HubMemberSchema);

export default HubMember;
