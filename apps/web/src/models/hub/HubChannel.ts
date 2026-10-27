import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { CHANNEL_KINDS, type ChannelKind } from '@mba/shared/hub';

export interface ChannelOverwrite {
  target: Types.ObjectId;
  kind: 'role' | 'member';
  allow: number;
  deny: number;
}

export interface IHubChannel {
  _id: Types.ObjectId;
  server: Types.ObjectId;
  name: string;
  kind: ChannelKind;
  topic: string;
  /** Free-text grouping shown as a collapsible header. */
  category: string;
  position: number;
  overwrites: ChannelOverwrite[];
  slowModeSeconds: number;
  lastMessageAt?: Date;
  /** Discord bridge for this channel. The webhook URL is encrypted at rest. */
  discord?: {
    channelId: string;
    webhookUrl: string;
    direction: 'out' | 'in' | 'both';
  };
  archivedAt?: Date;
  createdAt: Date;
}

type HubChannelModel = Model<IHubChannel>;

const HubChannelSchema = new Schema<IHubChannel, HubChannelModel>(
  {
    server: { type: Schema.Types.ObjectId, ref: 'HubServer', required: true },
    name: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
    kind: { type: String, enum: CHANNEL_KINDS, default: 'text' },
    topic: { type: String, default: '', maxlength: 300 },
    category: { type: String, default: '', trim: true, maxlength: 40 },
    position: { type: Number, default: 0 },
    overwrites: [
      {
        _id: false,
        target: { type: Schema.Types.ObjectId, required: true },
        kind: { type: String, enum: ['role', 'member'], required: true },
        allow: { type: Number, default: 0 },
        deny: { type: Number, default: 0 },
      },
    ],
    slowModeSeconds: { type: Number, default: 0, min: 0, max: 21600 },
    lastMessageAt: { type: Date },
    discord: {
      channelId: { type: String },
      webhookUrl: { type: String, select: false },
      direction: { type: String, enum: ['out', 'in', 'both'] },
    },
    archivedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

HubChannelSchema.index({ server: 1, archivedAt: 1, position: 1 });
HubChannelSchema.index({ 'discord.channelId': 1 }, { sparse: true });

const HubChannel =
  (mongoose.models.HubChannel as HubChannelModel) || mongoose.model<IHubChannel, HubChannelModel>('HubChannel', HubChannelSchema);

export default HubChannel;
