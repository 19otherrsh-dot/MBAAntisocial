'use client';

import { useMemo, useState } from 'react';
import { Plus, Check, Trash2, Repeat, TriangleAlert, ListChecks, CalendarDays } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Banner, Chip, EmptyState, Segmented, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery, useAction, useNow } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import {
  TASK_TYPES,
  TASK_TYPE_META,
  TASK_PRIORITIES,
  TASK_PRIORITY_META,
  RECURRENCE_PATTERNS,
  RECURRENCE_META,
  type TaskType,
  type TaskPriority,
  type RecurrencePattern,
} from '@/lib/constants';
import { cn, describeDeadline, formatDayLabel, pluralise, toDateTimeLocalValue } from '@/lib/utils';
import styles from '../app.module.css';

interface Task {
  _id: string;
  title: string;
  description: string;
  course: string;
  type: TaskType;
  priority: TaskPriority;
  status: 'pending' | 'in_progress' | 'completed';
  dueAt?: string;
  recurrence?: RecurrencePattern;
  recurrenceParent?: string;
  isTemplate: boolean;
}

interface TaskResponse {
  tasks: Task[];
  habits: Task[];
  summary: { pending: number; completed: number; overdue: number; dueToday: number };
}

const URGENCY_CLASS = {
  none: styles.dueSafe,
  safe: styles.dueSafe,
  soon: styles.dueSoon,
  urgent: styles.dueUrgent,
  overdue: styles.dueOverdue,
} as const;

export default function TasksPage() {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [typeFilter, setTypeFilter] = useState<TaskType | 'all'>('all');
  const [composeOpen, setComposeOpen] = useState(false);

  const now = useNow();
  const { data, loading, error, refetch, mutate } = useApiQuery<TaskResponse>('/api/tasks');

  // Memoised so the fallbacks are referentially stable; a fresh `[]` each render
  // would invalidate every downstream memo.
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const habits = useMemo(() => data?.habits ?? [], [data]);
  const summary = data?.summary;

  const filtered = useMemo(
    () => (typeFilter === 'all' ? tasks : tasks.filter((task) => task.type === typeFilter)),
    [tasks, typeFilter]
  );

  const { overdue, today, later, done } = useMemo(() => {
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const buckets = {
      overdue: [] as Task[],
      today: [] as Task[],
      later: [] as Task[],
      done: [] as Task[],
    };

    for (const task of filtered) {
      if (task.status === 'completed') {
        buckets.done.push(task);
      } else if (!task.dueAt) {
        buckets.later.push(task);
      } else {
        const due = new Date(task.dueAt).getTime();
        if (due < now) buckets.overdue.push(task);
        else if (due <= endOfToday.getTime()) buckets.today.push(task);
        else buckets.later.push(task);
      }
    }

    return buckets;
  }, [filtered, now]);

  const toggle = async (task: Task) => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';

    // Optimistic: a checkbox that waits on the network feels broken.
    mutate((current) => ({
      ...current,
      tasks: current.tasks.map((row) =>
        row._id === task._id ? { ...row, status: nextStatus } : row
      ),
    }));

    try {
      await api.patch('/api/tasks', { taskId: task._id, status: nextStatus });
      refetch();
    } catch (caught) {
      // Put it back the way it was rather than leaving a lie on screen.
      mutate((current) => ({
        ...current,
        tasks: current.tasks.map((row) =>
          row._id === task._id ? { ...row, status: task.status } : row
        ),
      }));
      toast.error('Could not update', caught instanceof Error ? caught.message : undefined);
    }
  };

  const remove = async (task: Task) => {
    const confirmed = await confirm({
      title: task.isTemplate ? 'Delete this habit?' : 'Delete this task?',
      body: task.isTemplate
        ? 'Future instances go too. Anything already completed stays in your history.'
        : undefined,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await api.delete('/api/tasks', { id: task._id });
      toast.success('Deleted');
      refetch();
    } catch (caught) {
      toast.error('Could not delete', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Tasks &amp; deadlines</h2>
          <p className={styles.pageSubtitle}>
            {summary
              ? `${pluralise(summary.pending, 'open')} · ${summary.completed} done${
                  summary.overdue > 0 ? ` · ${summary.overdue} overdue` : ''
                }`
              : 'Loading…'}
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setComposeOpen(true)}>
          Add task
        </Button>
      </div>

      {summary && (summary.pending > 0 || summary.completed > 0) && (
        <div className={styles.statStrip}>
          <Stat value={summary.dueToday} label="Due today" tone={summary.dueToday > 0 ? 'amber' : undefined} />
          <Stat value={summary.overdue} label="Overdue" tone={summary.overdue > 0 ? 'rose' : undefined} />
          <Stat value={summary.pending} label="Open" />
          <Stat value={summary.completed} label="Completed" tone="teal" />
        </div>
      )}

      {habits.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionHead}>
            <Repeat size={15} />
            Daily habits
            <span className={styles.sectionCount}>{habits.length}</span>
          </h3>
          <div className={styles.habitStrip}>
            {habits.map((habit) => (
              <span key={habit._id} className={styles.habitChip}>
                {habit.title}
                <Chip tone="teal">
                  {habit.recurrence ? RECURRENCE_META[habit.recurrence].label : 'Repeats'}
                </Chip>
                <button
                  onClick={() => remove(habit)}
                  aria-label={`Delete habit ${habit.title}`}
                  style={{ color: 'var(--text-muted)', display: 'flex' }}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

      <div className={styles.toolbar}>
        <Segmented
          ariaLabel="Filter by task type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all' as const, label: 'All' },
            ...TASK_TYPES.map((type) => ({
              value: type,
              label: TASK_TYPE_META[type].label,
              count: tasks.filter((task) => task.type === type && task.status !== 'completed').length,
            })),
          ]}
        />
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className={styles.cardList}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 62 }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          art={<ListChecks size={40} strokeWidth={1.4} />}
          title="Nothing on the list"
          body="Add what is actually due this week — assignments, a comp registration, the reading you keep postponing."
          action={<Button onClick={() => setComposeOpen(true)}>Add your first task</Button>}
        />
      ) : (
        <>
          <TaskGroup
            title="Overdue"
            icon={<TriangleAlert size={15} style={{ color: 'var(--danger)' }} />}
            tasks={overdue}
            onToggle={toggle}
            onDelete={remove}
          />
          <TaskGroup
            title="Today"
            icon={<CalendarDays size={15} style={{ color: 'var(--amber)' }} />}
            tasks={today}
            onToggle={toggle}
            onDelete={remove}
          />
          <TaskGroup
            title="Coming up"
            icon={<ListChecks size={15} />}
            tasks={later}
            onToggle={toggle}
            onDelete={remove}
          />
          <TaskGroup
            title="Completed"
            icon={<Check size={15} style={{ color: 'var(--teal)' }} />}
            tasks={done.slice(0, 20)}
            onToggle={toggle}
            onDelete={remove}
            collapsedNote={done.length > 20 ? `Showing 20 of ${done.length}` : undefined}
          />
        </>
      )}

      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onDone={() => {
          setComposeOpen(false);
          refetch();
        }}
      />

      {confirmDialog}
    </>
  );
}

function TaskGroup({
  title,
  icon,
  tasks,
  onToggle,
  onDelete,
  collapsedNote,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: Task[];
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  collapsedNote?: string;
}) {
  if (tasks.length === 0) return null;

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHead}>
        {icon}
        {title}
        <span className={styles.sectionCount}>{tasks.length}</span>
      </h3>
      <div className={styles.cardList}>
        {tasks.map((task) => (
          <TaskRow key={task._id} task={task} onToggle={onToggle} onDelete={onDelete} />
        ))}
      </div>
      {collapsedNote && <p className="dim" style={{ fontSize: 'var(--t-xs)' }}>{collapsedNote}</p>}
    </section>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const done = task.status === 'completed';
  const deadline = describeDeadline(task.dueAt);
  const typeMeta = TASK_TYPE_META[task.type];
  const priorityMeta = TASK_PRIORITY_META[task.priority];

  return (
    <div
      className={cn(
        styles.taskRow,
        done && styles.taskDone,
        !done && deadline.urgency === 'overdue' && styles.taskOverdue
      )}
    >
      <button
        className={cn(styles.taskCheck, done && styles.taskCheckDone)}
        onClick={() => onToggle(task)}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      >
        <Check size={13} strokeWidth={3} />
      </button>

      <div className={styles.taskBody}>
        <div className={styles.taskTitle}>{task.title}</div>
        <div className={styles.taskMeta}>
          <Chip tone={typeMeta.tone}>{typeMeta.label}</Chip>
          {task.course && <Chip outline>{task.course}</Chip>}
          {task.priority !== 'medium' && (
            <Chip tone={priorityMeta.tone}>{priorityMeta.label} priority</Chip>
          )}
          {task.recurrenceParent && (
            <Chip outline icon={<Repeat size={11} />}>
              Habit
            </Chip>
          )}
          {task.dueAt && !done && (
            <span className={cn(styles.taskDue, URGENCY_CLASS[deadline.urgency])}>
              {deadline.text} · {formatDayLabel(task.dueAt)}
            </span>
          )}
        </div>
      </div>

      <button
        className={styles.taskDelete}
        onClick={() => onDelete(task)}
        aria-label={`Delete "${task.title}"`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function ComposeDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const now = useNow();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [course, setCourse] = useState('');
  const [type, setType] = useState<TaskType>('assignment');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueAt, setDueAt] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrencePattern>('daily');

  const create = useAction(async () => {
    await api.post('/api/tasks', {
      title: title.trim(),
      description: description.trim(),
      course: course.trim(),
      type,
      priority,
      dueAt: recurring || !dueAt ? null : new Date(dueAt).toISOString(),
      recurrence: recurring ? recurrence : null,
    });

    toast.success(recurring ? 'Habit added' : 'Task added');
    setTitle('');
    setDescription('');
    setCourse('');
    setDueAt('');
    setRecurring(false);
    onDone();
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={recurring ? 'Add a habit' : 'Add a task'}
      description={
        recurring
          ? 'Repeats on its own schedule and builds a history you can look back at.'
          : 'One thing, one deadline.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.pending}>
            Cancel
          </Button>
          <Button onClick={() => create.run()} loading={create.pending} disabled={!title.trim()}>
            {recurring ? 'Add habit' : 'Add task'}
          </Button>
        </>
      }
    >
      {create.error && <Banner variant="danger">{create.error}</Banner>}

      <Input
        label="What needs doing?"
        placeholder={recurring ? 'Read business news' : 'Marketing case submission'}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={200}
        autoFocus
      />

      <div className={styles.checkGrid}>
        <button
          type="button"
          className={cn(styles.checkTile, !recurring && styles.checkTileActive)}
          onClick={() => setRecurring(false)}
        >
          <CalendarDays size={15} />
          One-off, with a deadline
        </button>
        <button
          type="button"
          className={cn(styles.checkTile, recurring && styles.checkTileActive)}
          onClick={() => setRecurring(true)}
        >
          <Repeat size={15} />
          Repeats on a schedule
        </button>
      </div>

      {recurring ? (
        <Select
          label="How often"
          value={recurrence}
          onChange={(event) => setRecurrence(event.target.value as RecurrencePattern)}
          options={RECURRENCE_PATTERNS.map((pattern) => ({
            value: pattern,
            label: RECURRENCE_META[pattern].label,
          }))}
          hint="An instance is generated for each day, so a missed one is visible rather than silently forgotten."
        />
      ) : (
        <Input
          label="Due"
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          optional
          min={toDateTimeLocalValue(new Date(now - 86_400_000))}
        />
      )}

      <div className={styles.checkGrid}>
        <Select
          label="Type"
          value={type}
          onChange={(event) => setType(event.target.value as TaskType)}
          options={TASK_TYPES.map((value) => ({ value, label: TASK_TYPE_META[value].label }))}
        />
        <Select
          label="Priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value as TaskPriority)}
          options={TASK_PRIORITIES.map((value) => ({
            value,
            label: TASK_PRIORITY_META[value].label,
          }))}
        />
      </div>

      <Input
        label="Course"
        placeholder="Marketing Management"
        value={course}
        onChange={(event) => setCourse(event.target.value)}
        optional
        maxLength={100}
      />

      <Textarea
        label="Notes"
        placeholder="Anything future-you will need at 2am the night before."
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={2000}
        rows={3}
        optional
      />
    </Dialog>
  );
}
