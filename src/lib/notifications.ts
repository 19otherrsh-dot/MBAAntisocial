import type { Types } from 'mongoose';
import Notification from '@/models/Notification';
import User from '@/models/User';
import type { NotificationKind } from './constants';
import { pusherServer } from './pusherServer';

/**
 * Central notification engine (§7).
 *
 * Every module routes through `notify` rather than writing to the collection,
 * so preference checks, self-notification suppression, and copy conventions are
 * enforced once. Delivery today is in-app only; email and push are additional
 * transports behind this same call, not a second call site.
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

/** Which preference flag, if any, gates each kind. */
const PREFERENCE_GATE: Partial<Record<NotificationKind, keyof PrefFlags>> = {
  session_reminder: 'sessionReminders',
  slot_booked: 'sessionReminders',
  slot_cancelled: 'sessionReminders',
  slot_rescheduled: 'sessionReminders',
  task_due_soon: 'deadlineReminders',
  comp_deadline: 'deadlineReminders',
  post_reply: 'feedComments',
};

interface PrefFlags {
  sessionReminders: boolean;
  deadlineReminders: boolean;
  feedComments: boolean;
  digest: boolean;
}

export async function notify(input: NotifyInput): Promise<void> {
  const userId = String(input.user);

  // Nobody needs telling about something they just did themselves.
  if (input.actor && String(input.actor) === userId) return;

  const gate = PREFERENCE_GATE[input.kind];
  if (gate) {
    const recipient = await User.findById(userId).select('notificationPrefs').lean();
    if (!recipient) return;
    if (recipient.notificationPrefs?.[gate] === false) return;
  }

  const notification = await Notification.create({
    user: userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? '',
    href: input.href ?? '/home',
    entityType: input.entityType,
    entity: input.entity,
    actor: input.actor,
  });

  try {
    await pusherServer.trigger(`user-${userId}`, 'new-notification', notification);
  } catch (err) {
    console.error('[pusher] failed to trigger new-notification:', err);
  }
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
