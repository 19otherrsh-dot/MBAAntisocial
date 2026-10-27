import { featureAvailable, type FeatureKey } from '@mba/shared/campus';
import type { Actor } from '@/lib/api/handler';
import { materialiseRecurringTasks } from '@/lib/recurrence';
import Task from '@/models/Task';
import User from '@/models/User';
import InterviewSlot from '@/models/InterviewSlot';
import Application from '@/models/Application';
import CaseComp from '@/models/CaseComp';
import NewsItem from '@/models/career/NewsItem';
import { QuizAttempt, QuizDay } from '@/models/career/Quiz';
import CheckIn from '@/models/personal/CheckIn';
import Event from '@/models/campus/Event';
import GameRoom from '@/models/games/GameRoom';
import { todaysClasses } from '@/server/modules/academics/service';
import { DAY_MS as DAY, DEFAULT_TIME_ZONE, localDayBounds } from '@/lib/time';
import { istDay } from '@/server/modules/briefing/service';
import { crossCampusMentorIds } from '@/server/modules/sessions/cross-campus';
import { getGame } from '@/server/modules/games/registry';

/**
 * The Today screen, composed from small card providers.
 *
 * Each provider declares the feature it belongs to and loads independently, in
 * parallel. A provider the caller's edition cannot use is skipped; one that
 * throws is reported in `failed` instead of taking the whole screen down. A new
 * card is a new provider — nothing else changes.
 */

export interface TodayContext {
  actor: Actor;
  timeZone: string;
  now: Date;
  dayKey: string;
  dayStart: Date;
  dayEnd: Date;
}

interface PersonRef {
  id: string;
  name: string;
  image?: string;
}

export interface TodayCards {
  classes: Awaited<ReturnType<typeof todaysClasses>>;
  tasks: {
    items: Array<{ id: string; title: string; course: string; type: string; dueAt: string | null; overdue: boolean }>;
    overdue: number;
    dueToday: number;
    pending: number;
  };
  agenda: Array<
    | { kind: 'session'; id: string; startAt: string; endAt: string; sessionType: string; role: 'host' | 'guest'; with: PersonRef | null }
    | { kind: 'round'; id: string; startAt: string; company: string; label: string; roundType: string }
  >;
  briefing: { day: string; count: number; headline: { title: string; source: string; url: string } | null };
  quiz: { ready: boolean; played: boolean; score: number | null; total: number };
  checkIn: { done: boolean };
  events: Array<{ id: string; title: string; startAt: string; endAt: string; venue: string; category: string; going: boolean; goingCount: number }>;
  comps: Array<{ id: string; title: string; host: string; registrationDeadline: string }>;
  games: Array<{ id: string; game: string; gameName: string; status: string; tournament: boolean }>;
  openEdition: { crossCampusSlots: number };
}

interface CardProvider<K extends keyof TodayCards> {
  key: K;
  /** The surface this card belongs to; omitted for cards that only show the caller's own records. */
  feature?: FeatureKey;
  /** Extra condition beyond the feature, e.g. Open-Edition-only cards. */
  when?: (ctx: TodayContext) => boolean;
  load: (ctx: TodayContext) => Promise<TodayCards[K]>;
}

const person = (value: unknown): PersonRef | null => {
  if (!value || typeof value !== 'object' || !('name' in value)) return null;
  const v = value as { _id: unknown; name: string; image?: string };
  return { id: String(v._id), name: v.name, image: v.image || undefined };
};

const classes: CardProvider<'classes'> = {
  key: 'classes',
  feature: 'timetable',
  load: ({ actor, timeZone, now }) => todaysClasses(actor.id, timeZone, now),
};

const tasks: CardProvider<'tasks'> = {
  key: 'tasks',
  feature: 'tasks',
  load: async ({ actor, now, dayEnd, timeZone }) => {
    await materialiseRecurringTasks(actor.id, now, timeZone);
    const base = { user: actor.id, isTemplate: false, status: { $ne: 'completed' as const } };
    const [due, overdue, dueToday, pending] = await Promise.all([
      Task.find({ ...base, dueAt: { $lte: dayEnd } }).sort({ dueAt: 1 }).limit(6).select('title course type dueAt').lean(),
      Task.countDocuments({ ...base, dueAt: { $lt: now } }),
      Task.countDocuments({ ...base, dueAt: { $gte: now, $lte: dayEnd } }),
      Task.countDocuments(base),
    ]);
    return {
      items: due.map((t) => ({
        id: String(t._id),
        title: t.title,
        course: t.course ?? '',
        type: t.type,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        overdue: Boolean(t.dueAt && t.dueAt < now),
      })),
      overdue,
      dueToday,
      pending,
    };
  },
};

/** Sessions on either side of the table, and placement rounds, for the next two days. */
const agenda: CardProvider<'agenda'> = {
  key: 'agenda',
  load: async ({ actor, now, dayEnd }) => {
    const horizon = new Date(dayEnd.getTime() + DAY);
    const [slots, applications] = await Promise.all([
      InterviewSlot.find({ status: 'booked', $or: [{ mentor: actor.id }, { bookedBy: actor.id }], endAt: { $gte: now }, startAt: { $lte: horizon } })
        .sort({ startAt: 1 })
        .limit(6)
        .populate('mentor', 'name image')
        .populate('bookedBy', 'name image')
        .lean(),
      featureAvailable('pipeline', actor.edition)
        ? Application.find({ user: actor.id, rounds: { $elemMatch: { outcome: 'pending', scheduledAt: { $gte: now, $lte: horizon } } } })
            .select('company rounds')
            .lean()
        : Promise.resolve([]),
    ]);
    const items: TodayCards['agenda'] = slots.map((s) => {
      const hosting = String((s.mentor as { _id?: unknown })?._id ?? s.mentor) === actor.id;
      return {
        kind: 'session',
        id: String(s._id),
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        sessionType: s.sessionType,
        role: hosting ? 'host' : 'guest',
        with: person(hosting ? s.bookedBy : s.mentor),
      };
    });
    for (const application of applications) {
      for (const round of application.rounds) {
        if (round.outcome !== 'pending' || !round.scheduledAt || round.scheduledAt < now || round.scheduledAt > horizon) continue;
        items.push({ kind: 'round', id: String(round._id), startAt: round.scheduledAt.toISOString(), company: application.company, label: round.label ?? '', roundType: round.type });
      }
    }
    return items.sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 6);
  },
};

const briefing: CardProvider<'briefing'> = {
  key: 'briefing',
  feature: 'news',
  load: async () => {
    const latest = await NewsItem.findOne().sort({ day: -1, publishedAt: -1 }).select('day').lean();
    if (!latest) return { day: istDay(), count: 0, headline: null };
    const [top, count] = await Promise.all([
      NewsItem.findOne({ day: latest.day }).sort({ publishedAt: -1 }).select('title source url').lean(),
      NewsItem.countDocuments({ day: latest.day }),
    ]);
    return { day: latest.day, count, headline: top ? { title: top.title, source: top.source, url: top.url } : null };
  },
};

const quiz: CardProvider<'quiz'> = {
  key: 'quiz',
  feature: 'quiz',
  load: async ({ actor }) => {
    const day = istDay();
    // Reads only: the quiz page generates the day's set on first open.
    const [quizDay, attempt] = await Promise.all([QuizDay.findOne({ day }).select('questions').lean(), QuizAttempt.findOne({ user: actor.id, day }).select('score').lean()]);
    return { ready: Boolean(quizDay), played: Boolean(attempt), score: attempt?.score ?? null, total: quizDay?.questions.length ?? 5 };
  },
};

const checkIn: CardProvider<'checkIn'> = {
  key: 'checkIn',
  feature: 'wellness',
  load: async ({ actor, dayKey }) => ({ done: Boolean(await CheckIn.exists({ user: actor.id, day: dayKey })) }),
};

const events: CardProvider<'events'> = {
  key: 'events',
  feature: 'events',
  load: async ({ actor, now, dayEnd }) => {
    const list = await Event.find({ campus: actor.campus, status: 'scheduled', endAt: { $gte: now }, startAt: { $lte: new Date(dayEnd.getTime() + DAY) } })
      .sort({ startAt: 1 })
      .limit(5)
      .select('title startAt endAt venue category rsvps goingCount')
      .lean();
    return list.map((e) => ({
      id: String(e._id),
      title: e.title,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      venue: e.venue,
      category: e.category,
      going: e.rsvps.some((r) => String(r.user) === actor.id && r.status === 'going'),
      goingCount: e.goingCount,
    }));
  },
};

const comps: CardProvider<'comps'> = {
  key: 'comps',
  feature: 'comps',
  load: async ({ actor, now }) => {
    const list = await CaseComp.find({ savedBy: actor.id, registrationDeadline: { $gte: now, $lte: new Date(now.getTime() + 7 * DAY) } })
      .sort({ registrationDeadline: 1 })
      .limit(3)
      .select('title host registrationDeadline')
      .lean();
    return list.map((c) => ({ id: String(c._id), title: c.title, host: c.host, registrationDeadline: c.registrationDeadline.toISOString() }));
  },
};

/** Tables the caller is seated at that are waiting on them. */
const games: CardProvider<'games'> = {
  key: 'games',
  feature: 'games',
  load: async ({ actor }) => {
    const rooms = await GameRoom.find({ status: { $in: ['lobby', 'playing'] }, seats: { $elemMatch: { user: actor.id, left: false } } })
      .sort({ updatedAt: -1 })
      .limit(3)
      .select('game status tournament')
      .lean();
    return Promise.all(
      rooms.map(async (r) => ({ id: String(r._id), game: r.game, gameName: (await getGame(r.game))?.title ?? r.game, status: r.status, tournament: Boolean(r.tournament) }))
    );
  },
};

/** Open Edition: what is already useful before the campus unlocks. */
const openEdition: CardProvider<'openEdition'> = {
  key: 'openEdition',
  feature: 'cross_campus_mentors',
  when: ({ actor }) => actor.edition === 'open',
  load: async ({ actor, now }) => {
    const mentors = await crossCampusMentorIds(actor.campus);
    const crossCampusSlots = mentors.length ? await InterviewSlot.countDocuments({ status: 'available', mentor: { $in: mentors }, startAt: { $gte: now } }) : 0;
    return { crossCampusSlots };
  },
};

const PROVIDERS = [classes, tasks, agenda, briefing, quiz, checkIn, events, comps, games, openEdition] as const;

export async function buildToday(actor: Actor, now = new Date()) {
  const user = await User.findById(actor.id).select('timezone').lean();
  const timeZone = user?.timezone || DEFAULT_TIME_ZONE;
  const ctx: TodayContext = { actor, timeZone, now, ...localDayBounds(now, timeZone) };

  const active = PROVIDERS.filter((p) => (!p.feature || featureAvailable(p.feature, actor.edition)) && (!p.when || p.when(ctx)));
  const settled = await Promise.allSettled(active.map((p) => p.load(ctx as TodayContext)));

  const cards: Partial<TodayCards> = {};
  const failed: string[] = [];
  settled.forEach((result, i) => {
    const key = active[i].key;
    if (result.status === 'fulfilled') (cards as Record<string, unknown>)[key] = result.value;
    else {
      failed.push(key);
      console.error(`[today] ${key} failed`, result.reason);
    }
  });
  return { timeZone, dayKey: ctx.dayKey, generatedAt: now.toISOString(), edition: actor.edition, cards, failed };
}
