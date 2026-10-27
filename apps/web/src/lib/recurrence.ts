import Task from '@/models/Task';
import User from '@/models/User';
import type { RecurrencePattern } from './constants';
import { DEFAULT_TIME_ZONE, addDays, dayKeyIn, startOfLocalDay, weekdayOfKey } from './time';

/** How far ahead instances are materialised. */
const HORIZON_DAYS = 14;

/** Whether an instance is due on day `key` for a template that began on `anchorKey`. */
function occursOn(pattern: RecurrencePattern, anchorKey: string, key: string): boolean {
  const weekday = weekdayOfKey(key);
  switch (pattern) {
    case 'daily':
      return true;
    case 'weekdays':
      return weekday !== 0 && weekday !== 6;
    case 'weekly':
      return weekday === weekdayOfKey(anchorKey);
  }
}

/**
 * Materialises upcoming instances for a user's recurring templates.
 *
 * A recurring habit is stored as a template plus one row per day rather than a
 * single row that gets re-checked. That is what gives "read business news" an
 * actual history — without instances there is nothing for a streak to count and
 * no way to tell a missed Tuesday from one that never existed.
 *
 * Days are the user's own calendar days: an instance is due at the end of
 * *their* day, whatever zone the server runs in.
 *
 * Called lazily when the task list is read, so no cron is required. It is
 * idempotent: the unique (recurrenceParent, dueAt) index means a concurrent
 * second call cannot produce duplicates.
 */
export async function materialiseRecurringTasks(userId: string, now: Date = new Date(), timeZone?: string): Promise<number> {
  const templates = await Task.find({
    user: userId,
    isTemplate: true,
    recurrence: { $exists: true },
  }).lean();

  if (templates.length === 0) return 0;

  const zone = timeZone ?? (await User.findById(userId).select('timezone').lean())?.timezone ?? DEFAULT_TIME_ZONE;
  const todayKey = dayKeyIn(now, zone);
  const horizonKey = addDays(todayKey, HORIZON_DAYS);

  const pending: Array<Record<string, unknown>> = [];

  for (const template of templates) {
    if (!template.recurrence) continue;

    const anchorKey = dayKeyIn(template.createdAt, zone);
    // Resume from the day after the last generated one, but never backfill
    // history — a habit tracker that opens with two weeks of red is useless.
    const lastKey = template.lastGeneratedFor ? dayKeyIn(template.lastGeneratedFor, zone) : null;
    if (lastKey && lastKey >= horizonKey) continue;
    const firstKey = lastKey && lastKey >= todayKey ? addDays(lastKey, 1) : todayKey;

    for (let key = firstKey; key <= horizonKey; key = addDays(key, 1)) {
      if (!occursOn(template.recurrence, anchorKey, key)) continue;

      pending.push({
        user: userId,
        title: template.title,
        description: template.description,
        course: template.course,
        type: template.type,
        priority: template.priority,
        // Due at the end of the user's day, matching how a daily habit is actually judged.
        dueAt: new Date(startOfLocalDay(addDays(key, 1), zone).getTime() - 1),
        status: 'pending',
        recurrenceParent: template._id,
        isTemplate: false,
      });
    }

    await Task.updateOne({ _id: template._id }, { $set: { lastGeneratedFor: startOfLocalDay(horizonKey, zone) } });
  }

  if (pending.length === 0) return 0;

  // `ordered: false` lets the rest insert when one collides with an instance a
  // concurrent request already created.
  try {
    const result = await Task.insertMany(pending, { ordered: false });
    return result.length;
  } catch (error) {
    if (isBulkWriteError(error)) {
      return error.insertedDocs?.length ?? 0;
    }
    throw error;
  }
}

interface BulkWriteError {
  code?: number;
  writeErrors?: unknown[];
  insertedDocs?: unknown[];
}

function isBulkWriteError(error: unknown): error is BulkWriteError {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('writeErrors' in error || (error as { code?: number }).code === 11000)
  );
}
