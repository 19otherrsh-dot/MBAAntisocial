import Task from '@/models/Task';
import { DAY_MS, startOfDay, endOfDay, weekdayOf } from './time';
import type { RecurrencePattern } from './constants';

/** How far ahead instances are materialised. */
const HORIZON_DAYS = 14;

/*
 * Every "which day is it" question here is answered in the campus zone (see
 * `lib/time.ts`). Using the process's local midnight made a daily habit fall
 * due at 05:29 the next morning for an Indian campus on a UTC host.
 */
function isWeekday(date: Date): boolean {
  const day = weekdayOf(date);
  return day !== 0 && day !== 6;
}

/** Whether an instance is due on `date` for a template that began on `anchor`. */
function occursOn(pattern: RecurrencePattern, anchor: Date, date: Date): boolean {
  switch (pattern) {
    case 'daily':
      return true;
    case 'weekdays':
      return isWeekday(date);
    case 'weekly':
      return weekdayOf(date) === weekdayOf(anchor);
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
 * Called lazily when the task list is read, so no cron is required. It is
 * idempotent: the unique (recurrenceParent, dueAt) index means a concurrent
 * second call cannot produce duplicates.
 */
export async function materialiseRecurringTasks(userId: string, now: Date = new Date()): Promise<number> {
  const templates = await Task.find({
    user: userId,
    isTemplate: true,
    recurrence: { $exists: true },
  }).lean();

  if (templates.length === 0) return 0;

  const today = startOfDay(now);
  const horizon = new Date(today.getTime() + HORIZON_DAYS * DAY_MS);

  const pending: Array<Record<string, unknown>> = [];

  for (const template of templates) {
    if (!template.recurrence) continue;

    const anchor = startOfDay(template.createdAt);
    // Resume from the day after the last generated one, but never backfill
    // history — a habit tracker that opens with two weeks of red is useless.
    const lastGenerated = template.lastGeneratedFor
      ? startOfDay(template.lastGeneratedFor)
      : null;
    const cursorStart =
      lastGenerated && lastGenerated >= today
        ? new Date(lastGenerated.getTime() + DAY_MS)
        : today;

    for (let cursor = new Date(cursorStart); cursor <= horizon; cursor = new Date(cursor.getTime() + DAY_MS)) {
      if (!occursOn(template.recurrence, anchor, cursor)) continue;

      // Due at the end of the campus day, matching how a daily habit is judged.
      const dueAt = endOfDay(cursor);

      pending.push({
        user: userId,
        title: template.title,
        description: template.description,
        course: template.course,
        type: template.type,
        priority: template.priority,
        dueAt,
        status: 'pending',
        recurrenceParent: template._id,
        isTemplate: false,
      });
    }

    await Task.updateOne({ _id: template._id }, { $set: { lastGeneratedFor: horizon } });
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
