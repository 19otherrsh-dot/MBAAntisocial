import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createTaskSchema, updateTaskSchema, taskQuerySchema, objectId } from '@/lib/validation';
import { materialiseRecurringTasks } from '@/lib/recurrence';
import { award, revoke } from '@/lib/gamification';
import Task from '@/models/Task';
import type { QueryFilter } from 'mongoose';
import type { ITask } from '@/models/Task';

/**
 * Lists the caller's tasks.
 *
 * Recurring instances are materialised on read rather than by a scheduled job,
 * so a single-instance deployment needs no cron and a user who has been away
 * for a week still sees a correct list the moment they open the page.
 */
export const GET = route({ query: taskQuerySchema }, async ({ actor, query }) => {
  await materialiseRecurringTasks(actor.id);

  const filter: QueryFilter<ITask> = { user: actor.id, isTemplate: false };
  if (query.type) filter.type = query.type;
  if (!query.includeCompleted) filter.status = { $ne: 'completed' };

  const [tasks, templates] = await Promise.all([
    Task.find(filter)
      // Undated tasks sort last rather than jumping to the top as nulls.
      .sort({ status: 1, dueAt: 1, createdAt: -1 })
      .limit(300)
      .lean(),
    Task.find({ user: actor.id, isTemplate: true }).sort({ createdAt: -1 }).lean(),
  ]);

  return ok({
    tasks: tasks.map(serialiseTask),
    /** Recurring habits, shown separately from one-off to-dos. */
    habits: templates.map(serialiseTask),
    summary: summarise(tasks),
  });
});

export const POST = route({ body: createTaskSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const isRecurring = Boolean(body.recurrence);

  const task = await Task.create({
    user: actor.id,
    title: body.title,
    description: body.description,
    course: body.course,
    type: isRecurring ? 'daily' : body.type,
    priority: body.priority,
    dueAt: isRecurring ? undefined : body.dueAt ?? undefined,
    recurrence: body.recurrence ?? undefined,
    isTemplate: isRecurring,
    caseComp: body.caseComp,
  });

  // Materialise straight away so a new habit appears in today's list rather
  // than only after the next read.
  if (isRecurring) await materialiseRecurringTasks(actor.id);

  return created({ task: serialiseTask(task.toObject()) });
});

export const PATCH = route({ body: updateTaskSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const task = await Task.findOne({ _id: body.taskId, user: actor.id });
  if (!task) throw ApiError.notFound('That task does not exist.');

  const wasCompleted = task.status === 'completed';

  if (body.title !== undefined) task.title = body.title;
  if (body.description !== undefined) task.description = body.description;
  if (body.course !== undefined) task.course = body.course;
  if (body.type !== undefined) task.type = body.type;
  if (body.priority !== undefined) task.priority = body.priority;
  if (body.dueAt !== undefined) task.dueAt = body.dueAt ?? undefined;

  if (body.status !== undefined && body.status !== task.status) {
    task.status = body.status;

    if (body.status === 'completed') {
      const completedAt = new Date();
      task.completedAt = completedAt;
      task.completedOnTime = task.dueAt ? completedAt <= task.dueAt : true;
    } else {
      task.completedAt = undefined;
      task.completedOnTime = undefined;
    }
  }

  await task.save();

  const nowCompleted = task.status === 'completed';

  /*
   * Points move with the completion state in both directions. Keying the award
   * on the task id means un-checking and re-checking a task cannot mint points
   * — the ledger already holds an entry for it.
   */
  if (!wasCompleted && nowCompleted) {
    await award(actor.id, 'task_completed', { entityType: 'task', entity: task._id });
    if (task.completedOnTime && task.dueAt) {
      await award(actor.id, 'task_completed_on_time', { entityType: 'task', entity: task._id });
    }
  } else if (wasCompleted && !nowCompleted) {
    await revoke(actor.id, 'task_completed', task._id);
    await revoke(actor.id, 'task_completed_on_time', task._id);
  }

  return ok({ task: serialiseTask(task.toObject()) });
});

/**
 * Deletes a task. Removing a habit template also removes its future instances,
 * since orphaned instances would keep appearing with nothing generating them.
 */
export const DELETE = route({ rateLimit: 'write' }, async ({ actor, request }) => {
  const id = new URL(request.url).searchParams.get('id');
  const taskId = objectId.parse(id ?? '');

  const task = await Task.findOneAndDelete({ _id: taskId, user: actor.id });
  if (!task) throw ApiError.notFound('That task does not exist.');

  if (task.isTemplate) {
    await Task.deleteMany({
      user: actor.id,
      recurrenceParent: task._id,
      status: 'pending',
      dueAt: { $gte: new Date() },
    });
  }

  return ok({ deleted: true });
});

function serialiseTask(task: Omit<ITask, '_id'> & { _id: unknown }) {
  return { ...task, _id: String(task._id) };
}

function summarise(tasks: Array<{ status: string; dueAt?: Date | null }>) {
  const now = Date.now();
  let pending = 0;
  let completed = 0;
  let overdue = 0;
  let dueToday = 0;

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  for (const task of tasks) {
    if (task.status === 'completed') {
      completed += 1;
      continue;
    }
    pending += 1;
    if (!task.dueAt) continue;
    const due = new Date(task.dueAt).getTime();
    if (due < now) overdue += 1;
    else if (due <= endOfToday.getTime()) dueToday += 1;
  }

  return { pending, completed, overdue, dueToday };
}
