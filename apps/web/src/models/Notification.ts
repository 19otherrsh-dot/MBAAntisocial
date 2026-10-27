import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { NOTIFICATION_KINDS, type NotificationKind } from '@/lib/constants';

/**
 * One central notification record for every module (§7).
 *
 * Modules call `notify()` in `lib/notifications.ts` rather than writing here
 * directly, so delivery preferences and copy live in one place instead of being
 * reimplemented per feature.
 */
export interface INotification {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  kind: NotificationKind;

  title: string;
  body: string;
  /** In-app destination for the notification's primary action. */
  href: string;

  /** Loose reference to whatever the notification is about. */
  entityType?: string;
  entity?: Types.ObjectId;
  /** Who caused it, when that is a person. */
  actor?: Types.ObjectId;

  readAt?: Date;
  createdAt: Date;
}

type NotificationModel = Model<INotification>;

const NotificationSchema = new Schema<INotification, NotificationModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },

    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, default: '', maxlength: 500 },
    href: { type: String, default: '/home', maxlength: 500 },

    entityType: { type: String, maxlength: 40 },
    entity: { type: Schema.Types.ObjectId },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },

    readAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Inbox read path, and the unread badge count.
NotificationSchema.index({ user: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, readAt: 1 });
// Notifications are ephemeral; drop them after 90 days rather than growing forever.
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const Notification =
  (mongoose.models.Notification as NotificationModel) ||
  mongoose.model<INotification, NotificationModel>('Notification', NotificationSchema);

export default Notification;
