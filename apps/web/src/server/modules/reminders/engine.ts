import type { Types } from 'mongoose';
import ReminderLog from '@/models/ReminderLog';
import { notify, type NotifyInput } from '@/lib/notifications';

/**
 * Time-based reminders. Each rule finds what is coming due and returns the
 * notifications it wants sent; the engine claims each one in `ReminderLog`
 * before sending, so a rule never has to remember what it already did.
 *
 * New modules add a rule to `REMINDER_RULES` (see rules.ts) — nothing here changes.
 */
export interface DueReminder extends NotifyInput {
  entity: Types.ObjectId | string;
}

export interface ReminderRule {
  /** Stable key; part of the dedupe identity. */
  key: string;
  collect(now: Date): Promise<DueReminder[]>;
}

export async function runReminders(rules: ReminderRule[], now = new Date()) {
  const summary: Record<string, number> = {};
  for (const rule of rules) {
    let sent = 0;
    try {
      const due = await rule.collect(now);
      for (const reminder of due) {
        try {
          await ReminderLog.create({ rule: rule.key, user: reminder.user, entity: reminder.entity });
        } catch {
          continue; // Already sent — the unique index said so.
        }
        await notify(reminder);
        sent += 1;
      }
    } catch (error) {
      console.error(`[reminders] rule ${rule.key} failed:`, error);
    }
    summary[rule.key] = sent;
  }
  return summary;
}
