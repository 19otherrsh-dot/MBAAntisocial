import { WEEKDAYS } from '@mba/shared/academics';
import { env } from '@/lib/env';
import ClassSlot from '@/models/academics/ClassSlot';
import InterviewSlot from '@/models/InterviewSlot';
import Task from '@/models/Task';
import Event from '@/models/campus/Event';
import type { IcsEvent } from './ics';

export interface FeedUser {
  id: string;
  timeZone: string;
}

/**
 * Each module contributes the events it owns to the personal calendar feed.
 * New modules append a provider here; the feed route never changes.
 */
export type CalendarProvider = (user: FeedUser) => Promise<IcsEvent[]>;

const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

/** Next date (YYYYMMDD) on or after today that falls on `day` (Mon=0) in the zone. */
function nextLocalDate(day: number, timeZone: string): string {
  const now = new Date();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(d);
    if (name === WEEKDAYS[day]) return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/-/g, '');
  }
  return '';
}

const timetable: CalendarProvider = async (user) => {
  const slots = await ClassSlot.find({ user: user.id }).populate<{ course: { _id: unknown; name: string; code: string; professor: string; archived: boolean } }>('course', 'name code professor archived').lean();
  return slots
    .filter((s) => s.course && !s.course.archived)
    .map((s) => {
      const date = nextLocalDate(s.day, user.timeZone);
      return {
        uid: `class-${s._id}@mba-antisocial`,
        title: s.course.code ? `${s.course.code} · ${s.course.name}` : s.course.name,
        description: s.course.professor ? `Prof. ${s.course.professor}` : undefined,
        location: s.room || undefined,
        start: { local: `${date}T${s.start.replace(':', '')}00`, timeZone: user.timeZone },
        end: { local: `${date}T${s.end.replace(':', '')}00`, timeZone: user.timeZone },
        rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[s.day]}`,
      };
    });
};

const sessions: CalendarProvider = async (user) => {
  const since = new Date(Date.now() - 14 * 86_400_000);
  const rows = await InterviewSlot.find({ status: { $in: ['booked', 'completed'] }, startAt: { $gte: since }, $or: [{ mentor: user.id }, { bookedBy: user.id }] })
    .populate<{ mentor: { name: string }; bookedBy: { name: string } }>('mentor bookedBy', 'name')
    .lean();
  return rows.map((s) => {
    const mentoring = String((s.mentor as unknown as { _id: unknown })._id) === user.id;
    return {
      uid: `session-${s._id}@mba-antisocial`,
      title: mentoring ? `Mock with ${s.bookedBy?.name ?? 'a junior'}` : `Mock with ${s.mentor?.name ?? 'a senior'}`,
      description: s.meetingLink ? `Join: ${s.meetingLink}` : undefined,
      url: `${env.APP_URL}/sessions`,
      start: s.startAt,
      end: s.endAt,
    };
  });
};

const tasks: CalendarProvider = async (user) => {
  const rows = await Task.find({ user: user.id, isTemplate: { $ne: true }, status: { $ne: 'completed' }, dueAt: { $gte: new Date(Date.now() - 7 * 86_400_000) } })
    .select('title dueAt')
    .limit(200)
    .lean();
  return rows.map((t) => ({
    uid: `task-${t._id}@mba-antisocial`,
    title: `Due: ${t.title}`,
    url: `${env.APP_URL}/tasks`,
    start: new Date(t.dueAt!.getTime() - 30 * 60_000),
    end: t.dueAt!,
  }));
};

const events: CalendarProvider = async (user) => {
  const rows = await Event.find({ rsvps: { $elemMatch: { user: user.id, status: { $in: ['going', 'interested'] } } }, endAt: { $gte: new Date(Date.now() - 14 * 86_400_000) } })
    .select('title description venue onlineUrl startAt endAt status rsvps')
    .lean();
  return rows.map((e) => {
    const mine = e.rsvps.find((r) => String(r.user) === user.id);
    return {
      uid: `event-${e._id}@mba-antisocial`,
      title: e.title,
      description: e.description.slice(0, 500) || undefined,
      location: e.venue || undefined,
      url: `${env.APP_URL}/events/${e._id}`,
      start: e.startAt,
      end: e.endAt,
      status: e.status === 'cancelled' ? 'CANCELLED' : mine?.status === 'going' ? 'CONFIRMED' : 'TENTATIVE',
    };
  });
};

const CALENDAR_PROVIDERS: CalendarProvider[] = [timetable, sessions, tasks, events];

export function registerCalendarProvider(provider: CalendarProvider) {
  CALENDAR_PROVIDERS.push(provider);
}

export async function collectEvents(user: FeedUser): Promise<IcsEvent[]> {
  const settled = await Promise.allSettled(CALENDAR_PROVIDERS.map((p) => p(user)));
  return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
