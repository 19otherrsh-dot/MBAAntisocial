import InterviewSlot from '@/models/InterviewSlot';
import Task from '@/models/Task';
import CaseComp from '@/models/CaseComp';
import { SESSION_TYPE_META } from '@/lib/constants';
import type { DueReminder, ReminderRule } from './engine';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function sessionRule(key: string, leadMs: number, label: string): ReminderRule {
  return {
    key,
    async collect(now) {
      const slots = await InterviewSlot.find({
        status: 'booked',
        startAt: { $gt: now, $lte: new Date(now.getTime() + leadMs) },
      })
        .select('mentor bookedBy startAt sessionType meetingLink')
        .populate<{ mentor: { _id: unknown; name: string }; bookedBy: { _id: unknown; name: string } }>('mentor bookedBy', 'name')
        .lean();

      const out: DueReminder[] = [];
      for (const slot of slots) {
        if (!slot.bookedBy) continue;
        const type = SESSION_TYPE_META[slot.sessionType].label;
        out.push(
          {
            user: String(slot.mentor._id),
            kind: 'session_reminder',
            title: `${type} with ${slot.bookedBy.name} ${label}`,
            body: slot.meetingLink ? 'Your meeting link is on the session card.' : 'Add a meeting link before it starts.',
            href: '/sessions',
            entity: slot._id,
          },
          {
            user: String(slot.bookedBy._id),
            kind: 'session_reminder',
            title: `${type} with ${slot.mentor.name} ${label}`,
            body: 'Have your resume open and one question you want answered.',
            href: '/sessions',
            entity: slot._id,
          }
        );
      }
      return out;
    },
  };
}

const tasksDueSoon: ReminderRule = {
  key: 'task_24h',
  async collect(now) {
    const tasks = await Task.find({
      isTemplate: false,
      status: { $ne: 'completed' },
      type: { $ne: 'daily' },
      dueAt: { $gt: now, $lte: new Date(now.getTime() + 24 * HOUR) },
    })
      .select('user title dueAt')
      .limit(5000)
      .lean();
    return tasks.map((task) => ({
      user: String(task.user),
      kind: 'task_due_soon' as const,
      title: `Due within a day: ${task.title}`,
      href: '/tasks',
      entity: task._id,
    }));
  },
};

const compDeadlines: ReminderRule = {
  key: 'comp_72h',
  async collect(now) {
    const comps = await CaseComp.find({
      archivedAt: { $exists: false },
      registrationDeadline: { $gt: now, $lte: new Date(now.getTime() + 72 * HOUR) },
      'savedBy.0': { $exists: true },
    })
      .select('title savedBy registrationDeadline')
      .lean();
    return comps.flatMap((comp) =>
      comp.savedBy.map((user) => ({
        user: String(user),
        kind: 'comp_deadline' as const,
        title: `Registration closes soon: ${comp.title}`,
        body: 'Three days or less. Team sorted?',
        href: '/comps',
        entity: comp._id,
      }))
    );
  },
};

/** Every module's reminder rules, in one list. */
export async function reminderRules(): Promise<ReminderRule[]> {
  const extra = await Promise.all([
    import('../events/reminders').then((m) => m.eventReminderRules).catch(() => []),
    import('../games/reminders').then((m) => m.gameReminderRules).catch(() => []),
  ]);
  return [
    sessionRule('session_24h', 24 * HOUR, 'is tomorrow'),
    sessionRule('session_1h', HOUR, 'starts within the hour'),
    tasksDueSoon,
    compDeadlines,
    ...extra.flat(),
  ];
}
