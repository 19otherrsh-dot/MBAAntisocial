import InterviewSlot from '@/models/InterviewSlot';
import Task from '@/models/Task';
import CaseComp from '@/models/CaseComp';
import Application from '@/models/Application';
import ReminderLog from '@/models/ReminderLog';
import { notify, type NotifyInput } from '../notifications';
import { SESSION_TYPE_META, ROUND_TYPE_META } from '../constants';
import { formatDateTime } from '../utils';

/**
 * Scheduled reminders.
 *
 * Each kind of reminder is a `ReminderRule`: it finds what is coming up and
 * describes the notifications, keyed. The runner sends each key at most once,
 * ever (see `ReminderLog`). New reminder kinds are new rules; the runner, the
 * dedupe, and the delivery channels do not change.
 *
 * Windows are wide enough to work whether the job runs hourly (best) or once a
 * day (Vercel's free plan): a reminder is sent on the first run inside its
 * window, and never again.
 */
export interface Reminder {
  key: string;
  notification: NotifyInput;
}

export interface ReminderRule {
  name: string;
  collect(now: Date): Promise<Reminder[]>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Upper bound per rule per run, so one run cannot outlive a function timeout. */
const BATCH = 500;

const sessionRule = (label: '24h' | '1h', from: number, to: number): ReminderRule => ({
  name: `session_${label}`,
  async collect(now) {
    const slots = await InterviewSlot.find({
      status: 'booked',
      startAt: { $gt: new Date(now.getTime() + from), $lte: new Date(now.getTime() + to) },
    })
      .limit(BATCH)
      .populate('mentor', 'name')
      .populate('bookedBy', 'name')
      .lean();

    return slots.flatMap((slot) => {
      const mentor = slot.mentor as unknown as { _id: unknown; name: string } | null;
      const mentee = slot.bookedBy as unknown as { _id: unknown; name: string } | null;
      if (!mentor || !mentee) return [];
      const kind = SESSION_TYPE_META[slot.sessionType].label.toLowerCase();
      const when = label === '1h' ? 'in an hour' : `tomorrow, ${formatDateTime(slot.startAt)}`;
      const link = slot.meetingLink ? ` Join: ${slot.meetingLink}` : '';
      return [
        {
          key: `session:${String(slot._id)}:${String(mentor._id)}:${label}`,
          notification: {
            user: String(mentor._id),
            kind: 'session_reminder',
            title: `Your ${kind} with ${mentee.name} is ${when}`,
            body: slot.meetingLink ? `Join: ${slot.meetingLink}` : 'Add a meeting link so they can join.',
            href: '/sessions?view=hosting',
            entityType: 'slot',
            entity: String(slot._id),
          },
        },
        {
          key: `session:${String(slot._id)}:${String(mentee._id)}:${label}`,
          notification: {
            user: String(mentee._id),
            kind: 'session_reminder',
            title: `Your ${kind} with ${mentor.name} is ${when}`,
            body: `Bring what you want feedback on.${link}`,
            href: '/sessions?view=bookings',
            entityType: 'slot',
            entity: String(slot._id),
          },
        },
      ];
    });
  },
});

const taskRule: ReminderRule = {
  name: 'task_due',
  async collect(now) {
    // Daily habits are left out on purpose: a reminder every day for every
    // habit is exactly the nagging the product promises not to do.
    const tasks = await Task.find({
      status: { $ne: 'completed' },
      isTemplate: false,
      recurrenceParent: { $exists: false },
      dueAt: { $gt: now, $lte: new Date(now.getTime() + 24 * HOUR) },
    })
      .limit(BATCH)
      .select('user title dueAt')
      .lean();
    return tasks.map((task) => ({
      key: `task:${String(task._id)}`,
      notification: {
        user: String(task.user),
        kind: 'task_due_soon',
        title: `Due ${formatDateTime(task.dueAt!)}: ${task.title}`,
        href: '/tasks',
        entityType: 'task',
        entity: String(task._id),
      },
    }));
  },
};

const compRule: ReminderRule = {
  name: 'comp_deadline',
  async collect(now) {
    const comps = await CaseComp.find({
      archivedAt: { $exists: false },
      registrationDeadline: { $gt: now, $lte: new Date(now.getTime() + 48 * HOUR) },
      'savedBy.0': { $exists: true },
    })
      .limit(BATCH)
      .select('title host registrationDeadline savedBy')
      .lean();
    return comps.flatMap((comp) =>
      (comp.savedBy ?? []).map((userId) => ({
        key: `comp:${String(comp._id)}:${String(userId)}`,
        notification: {
          user: String(userId),
          kind: 'comp_deadline' as const,
          title: `Registration closes ${formatDateTime(comp.registrationDeadline)}: ${comp.title}`,
          body: comp.host,
          href: '/comps?saved=true',
          entityType: 'comp',
          entity: String(comp._id),
        },
      }))
    );
  },
};

const roundRule: ReminderRule = {
  name: 'round_tomorrow',
  async collect(now) {
    const end = new Date(now.getTime() + 24 * HOUR);
    const applications = await Application.find({
      rounds: { $elemMatch: { outcome: 'pending', scheduledAt: { $gt: now, $lte: end } } },
    })
      .limit(BATCH)
      .select('user company rounds')
      .lean();
    return applications.flatMap((application) =>
      application.rounds
        .filter((round) => round.outcome === 'pending' && round.scheduledAt && round.scheduledAt > now && round.scheduledAt <= end)
        .map((round) => ({
          key: `round:${String(round._id)}`,
          notification: {
            user: String(application.user),
            kind: 'round_upcoming' as const,
            title: `${ROUND_TYPE_META[round.type].label} at ${application.company}: ${formatDateTime(round.scheduledAt!)}`,
            body: 'Your campus logged what this panel asked — worth ten minutes tonight.',
            href: `/intel?company=${encodeURIComponent(application.company)}`,
            entityType: 'application',
            entity: String(application._id),
          },
        }))
    );
  },
};

export const REMINDER_RULES: readonly ReminderRule[] = [
  sessionRule('1h', 0, 75 * MINUTE),
  sessionRule('24h', 2 * HOUR, 26 * HOUR),
  taskRule,
  compRule,
  roundRule,
];

/** Records the key; false when it was already sent (the unique index refuses it). */
async function claim(key: string): Promise<boolean> {
  try {
    await ReminderLog.create({ key });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export interface ReminderRunResult {
  sent: Record<string, number>;
  skipped: number;
  failed: number;
}

export async function runReminders(now: Date = new Date(), rules: readonly ReminderRule[] = REMINDER_RULES): Promise<ReminderRunResult> {
  const result: ReminderRunResult = { sent: {}, skipped: 0, failed: 0 };

  for (const rule of rules) {
    const reminders = await rule.collect(now);
    result.sent[rule.name] = 0;
    for (const reminder of reminders) {
      if (!(await claim(reminder.key))) {
        result.skipped += 1;
        continue;
      }
      try {
        await notify(reminder.notification);
        result.sent[rule.name] += 1;
      } catch (error) {
        result.failed += 1;
        console.error(`[reminders] ${rule.name} ${reminder.key} failed:`, error);
      }
    }
  }
  return result;
}
