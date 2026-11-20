import type { Types } from 'mongoose';
import Notification from '@/models/Notification';
import User from '@/models/User';
import type { NotificationKind } from './constants';
import type { CalendarEvent } from './calendar';
import { CHANNELS, type Delivery } from './notify/channels';

/**
 * Central notification engine (§7).
 *
 * Every module routes through `notify` rather than writing to the collection,
 * so preference checks, self-notification suppression, and copy conventions are
 * enforced once. The in-app record is always written; every other way of
 * reaching someone (realtime, email, and whatever comes next) is a channel in
 * `notify/channels.ts`, each deciding for itself whether it carries a kind.
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
  /** Offered as a calendar invite by channels that can carry one (email). */
  calendar?: CalendarEvent;
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

  const recipient = await User.findById(userId).select('name email notificationPrefs suspendedAt').lean();
  if (!recipient || recipient.suspendedAt) return;

  const gate = PREFERENCE_GATE[input.kind];
  if (gate && recipient.notificationPrefs?.[gate] === false) return;

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

  const delivery: Delivery = {
    notification,
    recipient: {
      id: userId,
      name: recipient.name,
      email: recipient.email,
      prefs: { email: recipient.notificationPrefs?.email !== false },
    },
    calendar: input.calendar,
  };

  // Independent: one channel failing (a mail outage) never stops another.
  const results = await Promise.allSettled(
    CHANNELS.filter((channel) => channel.accepts(delivery)).map((channel) => channel.send(delivery))
  );
  for (const result of results) {
    if (result.status === 'rejected') console.error('[notify] channel failed:', result.reason);
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
