import type { INotification } from '@/models/Notification';
import type { NotificationKind } from '../constants';
import type { CalendarEvent } from '../calendar';
import { generateIcs } from '../calendar';
import { publish } from '../pusherServer';
import { userChannel } from '../realtime';
import { sendEmail } from '../email';
import { env } from '../env';

/**
 * Delivery channels for a notification that has already been recorded.
 *
 * `notify()` decides *whether* and *what*; each channel decides only *how* it
 * delivers. Adding web push or SMS is a new class appended to `CHANNELS`, with
 * no change to `notify()` or its callers.
 */
export interface Recipient {
  id: string;
  name: string;
  email: string;
  prefs: { email: boolean };
}

export interface Delivery {
  notification: Pick<INotification, 'kind' | 'title' | 'body' | 'href'> & { _id: unknown };
  recipient: Recipient;
  /** A calendar event to offer alongside, where the channel can carry one. */
  calendar?: CalendarEvent;
}

export interface NotificationChannel {
  readonly name: string;
  /** Whether this channel carries this delivery at all. */
  accepts(delivery: Delivery): boolean;
  send(delivery: Delivery): Promise<void>;
}

/** Live push to the person's open tabs. */
export class RealtimeChannel implements NotificationChannel {
  readonly name = 'realtime';
  accepts(): boolean {
    return true;
  }
  async send({ notification, recipient }: Delivery): Promise<void> {
    await publish(userChannel(recipient.id), 'new-notification', notification);
  }
}

/**
 * Email, for the kinds worth interrupting someone's inbox for: things with a
 * time attached. Replies, upvotes and badges stay in the app.
 */
export const EMAIL_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>([
  'slot_booked',
  'slot_cancelled',
  'slot_rescheduled',
  'session_reminder',
  'feedback_requested',
  'task_due_soon',
  'comp_deadline',
  'round_upcoming',
  'moderation_action',
]);

export class EmailChannel implements NotificationChannel {
  readonly name = 'email';
  accepts({ notification, recipient }: Delivery): boolean {
    return recipient.prefs.email && Boolean(recipient.email) && EMAIL_KINDS.has(notification.kind);
  }
  async send({ notification, recipient, calendar }: Delivery): Promise<void> {
    await sendEmail({
      to: recipient.email,
      subject: notification.title,
      intro: notification.body ? `${notification.title}. ${notification.body}` : notification.title,
      action: { label: 'Open in MBAAntisocial', url: `${env.APP_URL}${notification.href || '/home'}` },
      footnote: 'You can turn these emails off in your profile, under Notifications.',
      attachments: calendar
        ? [{ filename: 'invite.ics', content: generateIcs(calendar), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }]
        : undefined,
    });
  }
}

export const CHANNELS: readonly NotificationChannel[] = [new RealtimeChannel(), new EmailChannel()];
