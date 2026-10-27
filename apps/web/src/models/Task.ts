import mongoose, { Schema, type Model, type Types } from 'mongoose';
import {
  TASK_TYPES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  RECURRENCE_PATTERNS,
  type TaskType,
  type TaskStatus,
  type TaskPriority,
  type RecurrencePattern,
} from '@/lib/constants';

export interface ITask {
  _id: Types.ObjectId;
  user: Types.ObjectId;

  title: string;
  description: string;
  course: string;
  type: TaskType;
  priority: TaskPriority;

  dueAt?: Date;
  status: TaskStatus;
  completedAt?: Date;
  /** Whether it was finished before `dueAt` — drives the on-time bonus. */
  completedOnTime?: boolean;

  /**
   * Recurring tasks are a template plus generated instances rather than one
   * row that gets toggled. Without instances a daily habit has no history, so
   * streaks and "did I read the news on Tuesday" cannot be answered.
   */
  recurrence?: RecurrencePattern;
  /** Set on instances, pointing at the template they came from. */
  recurrenceParent?: Types.ObjectId;
  /** Set on templates: the date through which instances exist. */
  lastGeneratedFor?: Date;
  /** True for the template row itself, which is never shown as a to-do. */
  isTemplate: boolean;

  /** Links a task to a tracked competition, if it came from one. */
  caseComp?: Types.ObjectId;
  /** Links a task to a placement round, so closing the process clears it. */
  application?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

type TaskModel = Model<ITask>;

const TaskSchema = new Schema<ITask, TaskModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    course: { type: String, default: '', trim: true, maxlength: 100 },
    type: { type: String, enum: TASK_TYPES, default: 'personal' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },

    dueAt: { type: Date },
    status: { type: String, enum: TASK_STATUSES, default: 'pending' },
    completedAt: { type: Date },
    completedOnTime: { type: Boolean },

    recurrence: { type: String, enum: RECURRENCE_PATTERNS },
    recurrenceParent: { type: Schema.Types.ObjectId, ref: 'Task' },
    lastGeneratedFor: { type: Date },
    isTemplate: { type: Boolean, default: false },

    caseComp: { type: Schema.Types.ObjectId, ref: 'CaseComp' },
    application: { type: Schema.Types.ObjectId, ref: 'Application' },
  },
  { timestamps: true }
);

// Main list view: a user's live tasks in deadline order.
TaskSchema.index({ user: 1, isTemplate: 1, status: 1, dueAt: 1 });
// Instance generation sweep.
TaskSchema.index({ user: 1, isTemplate: 1, recurrence: 1 });
// Prevents a double-generated instance for the same template and day.
TaskSchema.index(
  { recurrenceParent: 1, dueAt: 1 },
  { unique: true, partialFilterExpression: { recurrenceParent: { $exists: true } } }
);

const Task =
  (mongoose.models.Task as TaskModel) || mongoose.model<ITask, TaskModel>('Task', TaskSchema);

export default Task;
