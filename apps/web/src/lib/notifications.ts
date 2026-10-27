import type { Types } from 'mongoose';
import Notification from '@/models/Notification';
import User from '@/models/User';
import { NOTIFICATION_KIND_CATEGORY, type NotificationKind } from './constants';
import { CHANNELS } from '@/server/modules/notifications/channels';

/**
 * Central notification engine (§7).
 *
 * Every module routes through `notify` rather than writing to the collection,
 * so preference checks, self-notification suppression, and delivery are
 * enforced once. The in-app row is the source of truth; realtime, email, and
 * push are channels offered the stored notification afterwards.
 */

export interface NotifyInput {
  user: string | Types.ObjectId;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  entityType?: string;
  entity?: string | Types.ObjectId;
  /** Suppressed when the actor is also the recipient. */
  actor?: string | Types.ObjectId;
}

export async function notify(input: NotifyInput): Promise<void> {
  const userId = String(input.user);

  // Nobody needs telling about something they just did themselves.
  if (input.actor && String(input.actor) === userId) return;

  const recipient = await User.findById(userId).select('email notificationPrefs timezone suspendedAt').lean();
  if (!recipient || recipient.suspendedAt) return;

  const category = NOTIFICATION_KIND_CATEGORY[input.kind];
  if (category && recipient.notificationPrefs?.[category] === false) return;

  const notification = await Notification.create({
    user: userId,
    kind: input.kind,
    title: input.title.slice(0, 160),
    body: (input.body ?? '').slice(0, 500),
    href: input.href ?? '/home',
    entityType: input.entityType,
    entity: input.entity,
    actor: input.actor,
  });

  const unread = await unreadCount(userId);
  const deliverable = {
    id: notification._id.toString(),
    userId,
    email: recipient.email,
    kind: input.kind,
    title: notification.title,
    body: notification.body,
    href: notification.href,
    createdAt: notification.createdAt,
    prefs: recipient.notificationPrefs,
    timezone: recipient.timezone ?? 'Asia/Kolkata',
    unread,
  };

  // Channels are isolated from each other and from the caller: a dead push
  // endpoint must not stop the email, and neither may fail the action.
  const results = await Promise.allSettled(CHANNELS.map((channel) => channel.deliver(deliverable)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`[notifications] ${CHANNELS[i].name} delivery failed:`, result.reason);
    }
  });
}

/**
 * Fan-out helper. Failures are isolated per recipient so one bad row cannot
 * abort delivery to everyone else, and never propagate — a notification must
 * not fail the action that triggered it.
 */
export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  const results = await Promise.allSettled(inputs.map((input) => notify(input)));
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[notifications] delivery failed:', result.reason);
    }
  }
}

export async function unreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ user: userId, readAt: { $exists: false } });
}
