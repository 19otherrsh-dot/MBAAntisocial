import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { SERVER_KINDS, SERVER_VISIBILITIES, type ServerKind, type ServerVisibility } from '@mba/shared/hub';

/**
 * A hub server: one per campus (created automatically), plus clubs, interest
 * circles, course sections, and comp teams. Always inside one campus — the hub
 * is never a way to reach people at another school.
 */
export interface IHubServer {
  _id: Types.ObjectId;
  campus: string;
  name: string;
  description: string;
  kind: ServerKind;
  visibility: ServerVisibility;
  icon: string;
  /** Accent colour for the icon tile. */
  color: string;
  owner?: Types.ObjectId;
  everyoneRole?: Types.ObjectId;
  memberCount: number;
  /** Set when the server belongs to a club or team record. */
  linkedEntity?: { kind: 'club' | 'team' | 'course'; id: Types.ObjectId };
  /** Discord guild the server is bridged to, if any. */
  discordGuildId: string;
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type HubServerModel = Model<IHubServer>;

const HubServerSchema = new Schema<IHubServer, HubServerModel>(
  {
    campus: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: '', maxlength: 400 },
    kind: { type: String, enum: SERVER_KINDS, required: true },
    visibility: { type: String, enum: SERVER_VISIBILITIES, default: 'public' },
    icon: { type: String, default: '', maxlength: 500 },
    color: { type: String, default: '#5b4bdb', match: /^#[0-9a-f]{6}$/i },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
    everyoneRole: { type: Schema.Types.ObjectId, ref: 'HubRole' },
    memberCount: { type: Number, default: 0 },
    linkedEntity: {
      kind: { type: String, enum: ['club', 'team', 'course'] },
      id: { type: Schema.Types.ObjectId },
    },
    discordGuildId: { type: String, default: '' },
    archivedAt: { type: Date },
  },
  { timestamps: true }
);

HubServerSchema.index({ campus: 1, kind: 1, archivedAt: 1 });
// Exactly one campus server per campus.
HubServerSchema.index({ campus: 1 }, { unique: true, partialFilterExpression: { kind: 'campus' } });
HubServerSchema.index({ campus: 1, visibility: 1, memberCount: -1 });
HubServerSchema.index({ 'linkedEntity.id': 1 });

const HubServer =
  (mongoose.models.HubServer as HubServerModel) || mongoose.model<IHubServer, HubServerModel>('HubServer', HubServerSchema);

export default HubServer;
