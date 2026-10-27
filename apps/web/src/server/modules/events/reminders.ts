import Event from '@/models/campus/Event';
import type { DueReminder, ReminderRule } from '../reminders/engine';

const HOUR = 60 * 60_000;

function eventRule(key: string, leadMs: number, label: string): ReminderRule {
  return {
    key,
    async collect(now) {
      const events = await Event.find({ status: 'scheduled', startAt: { $gt: now, $lte: new Date(now.getTime() + leadMs) } }).select('title startAt venue rsvps').lean();
      const out: DueReminder[] = [];
      for (const e of events) {
        for (const r of e.rsvps) {
          if (r.status !== 'going') continue;
          out.push({ user: r.user, kind: 'event_reminder', title: `${e.title} ${label}`, body: e.venue || undefined, href: `/events/${e._id}`, entityType: 'Event', entity: e._id });
        }
      }
      return out;
    },
  };
}

export const eventReminderRules: ReminderRule[] = [eventRule('event_day_before', 24 * HOUR, 'is tomorrow'), eventRule('event_hour_before', HOUR, 'starts within the hour')];
