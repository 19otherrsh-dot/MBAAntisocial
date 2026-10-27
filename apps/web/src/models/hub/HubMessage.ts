import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface HubAttachment {
  url: string;
  name: string;
  mime: string;
  bytes: number;
}

/**
 * A message in a hub channel or a DM conversation (exactly one of the two).
 * Threads are messages whose `thread` points at their root.
 */
export interface IHubMessage {
  _id: Types.ObjectId;
  channel?: Types.ObjectId;
  server?: Types.ObjectId;
  conversation?: Types.ObjectId;
  author?: Types.ObjectId;
  content: string;
  attachments: HubAttachment[];
  mentions: { users: Types.ObjectId[]; roles: Types.ObjectId[]; everyone: boolean };
  replyTo?: Types.ObjectId;
  /** Root message id when this message is inside a thread. */
  thread?: Types.ObjectId;
  threadCount: number;
  lastThreadAt?: Date;
  /** Forum channels: a root post's title. */
  title: string;
  reactions: Array<{ emoji: string; users: Types.ObjectId[] }>;
  pinnedAt?: Date;
  editedAt?: Date;
  deletedAt?: Date;
  hiddenAt?: Date;
  hiddenBy?: Types.ObjectId;
  /** System notices ("Priya joined"). */
  system: boolean;
  /** Arrived through the Discord bridge. */
  viaDiscord?: { authorName: string; authorAvatar: string; messageId: string };
  /** Marked as the answer in a forum thread. */
  markedUseful: boolean;
  createdAt: Date;
}

type HubMessageModel = Model<IHubMessage>;

const HubMessageSchema = new Schema<IHubMessage, HubMessageModel>(
  {
    channel: { type: Schema.Types.ObjectId, ref: 'HubChannel' },
    server: { type: Schema.Types.ObjectId, ref: 'HubServer' },
    conversation: { type: Schema.Types.ObjectId, ref: 'HubConversation' },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, default: '', maxlength: 4000 },
    attachments: [
      {
        _id: false,
        url: { type: String, required: true, maxlength: 1000 },
        name: { type: String, default: '', maxlength: 200 },
        mime: { type: String, default: '', maxlength: 100 },
        bytes: { type: Number, default: 0 },
      },
    ],
    mentions: {
      users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      roles: [{ type: Schema.Types.ObjectId, ref: 'HubRole' }],
      everyone: { type: Boolean, default: false },
    },
    replyTo: { type: Schema.Types.ObjectId, ref: 'HubMessage' },
    thread: { type: Schema.Types.ObjectId, ref: 'HubMessage' },
    threadCount: { type: Number, default: 0 },
    lastThreadAt: { type: Date },
    title: { type: String, default: '', maxlength: 120 },
    reactions: [
      {
        _id: false,
        emoji: { type: String, required: true, maxlength: 32 },
        users: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      },
    ],
    pinnedAt: { type: Date },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    hiddenAt: { type: Date },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    system: { type: Boolean, default: false },
    viaDiscord: {
      authorName: { type: String },
      authorAvatar: { type: String },
      messageId: { type: String },
    },
    markedUseful: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Channel timeline (root messages), newest first, paged by createdAt.
HubMessageSchema.index({ channel: 1, thread: 1, createdAt: -1 });
// Thread replies.
HubMessageSchema.index({ thread: 1, createdAt: 1 });
// DM timeline.
HubMessageSchema.index({ conversation: 1, createdAt: -1 });
// Pins.
HubMessageSchema.index({ channel: 1, pinnedAt: -1 }, { sparse: true });
// Mentions inbox.
HubMessageSchema.index({ 'mentions.users': 1, createdAt: -1 });
// Discord dedupe.
HubMessageSchema.index({ 'viaDiscord.messageId': 1 }, { sparse: true });

const HubMessage =
  (mongoose.models.HubMessage as HubMessageModel) || mongoose.model<IHubMessage, HubMessageModel>('HubMessage', HubMessageSchema);

export default HubMessage;
