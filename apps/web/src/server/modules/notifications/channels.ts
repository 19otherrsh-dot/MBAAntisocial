import { topics } from '@mba/shared/realtime';
import { EMAIL_WORTHY_KINDS, type NotificationKind } from '@/lib/constants';
import { env } from '@/lib/env';
import PushDevice from '@/models/PushDevice';
import type { NotificationPreferences } from '@/models/User';
import { container } from '../../container';
import { notificationEmail } from '../../emails/templates';

/**
 * Delivery channels. The engine stores the in-app row, then offers it to each
 * channel; a channel decides for itself whether it applies. Adding SMS or
 * WhatsApp later is one more class in `CHANNELS`, nothing else changes.
 */
export interface Deliverable {
  id: string;
  userId: string;
  email: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  createdAt: Date;
  prefs: NotificationPreferences | undefined;
  timezone: string;
  unread: number;
}

export interface NotificationChannel {
  readonly name: string;
  deliver(n: Deliverable): Promise<void>;
}

/** Minutes since midnight in `timezone`. */
function localMinutes(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Quiet hours wrap midnight (23:00 → 08:00) as often as not. */
export function inQuietHours(prefs: NotificationPreferences | undefined, timezone: string, now = new Date()): boolean {
  const q = prefs?.quietHours;
  if (!q?.enabled) return false;
  const t = localMinutes(now, timezone);
  const start = toMinutes(q.start);
  const end = toMinutes(q.end);
  return start <= end ? t >= start && t < end : t >= start || t < end;
}

class RealtimeChannel implements NotificationChannel {
  readonly name = 'realtime';
  async deliver(n: Deliverable) {
    const { realtime } = container();
    await realtime.publish(topics.user(n.userId), 'notification.created', {
      id: n.id,
      title: n.title,
      body: n.body,
      href: n.href,
      kind: n.kind,
      createdAt: n.createdAt.toISOString(),
    });
    await realtime.publish(topics.user(n.userId), 'notification.count', { unread: n.unread });
  }
}

class EmailChannel implements NotificationChannel {
  readonly name = 'email';
  async deliver(n: Deliverable) {
    if (n.prefs?.email === false || !EMAIL_WORTHY_KINDS.has(n.kind)) return;
    const url = n.href.startsWith('http') ? n.href : `${env.APP_URL}${n.href}`;
    await container().email.send({ to: n.email, ...notificationEmail(n.title, n.body, url), idempotencyKey: `notif:${n.id}` });
  }
}

class PushChannel implements NotificationChannel {
  readonly name = 'push';
  async deliver(n: Deliverable) {
    if (n.prefs?.push === false || inQuietHours(n.prefs, n.timezone)) return;
    const devices = await PushDevice.find({ user: n.userId }).lean();
    if (devices.length === 0) return;

    const { webPush, nativePush } = container();
    const payload = { title: n.title, body: n.body, href: n.href, tag: n.kind };
    const web = devices.filter((d) => d.kind === 'web' && d.keys?.p256dh && d.keys.auth);
    const expo = devices.filter((d) => d.kind === 'expo');

    const outcomes = [
      ...(web.length && webPush.configured
        ? await webPush.send(web.map((d) => ({ endpoint: d.target, keys: { p256dh: d.keys!.p256dh, auth: d.keys!.auth } })), payload)
        : []),
      ...(expo.length ? await nativePush.send(expo.map((d) => d.target), payload) : []),
    ];

    const expired = outcomes.filter((o) => o.expired).map((o) => o.target);
    if (expired.length) await PushDevice.deleteMany({ target: { $in: expired } });
  }
}

export const CHANNELS: NotificationChannel[] = [new RealtimeChannel(), new EmailChannel(), new PushChannel()];
