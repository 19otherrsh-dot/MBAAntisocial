'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  ListChecks,
  Swords,
  Target,
  Flame,
  Sparkles,
  CheckCircle2,
  TriangleAlert,
  HeartHandshake,
  Users,
} from 'lucide-react';
import { useApiQuery, useNow } from '@/lib/client/hooks';
import { endOfDay } from '@/lib/time';
import { useMe } from '@/lib/client/me';
import { Chip, Stat, Banner, Avatar } from '@/components/ui/Display';
import Button from '@/components/ui/Button';
import {
  cn,
  describeDeadline,
  formatDateTime,
  formatDayLabel,
  pluralise,
} from '@/lib/utils';
import { SESSION_TYPE_META, ROUND_TYPE_META, type SessionType } from '@/lib/constants';
import styles from '../app.module.css';

interface TaskRow {
  _id: string;
  title: string;
  course: string;
  type: string;
  status: string;
  dueAt?: string;
  /** Set on a day's instance of a recurring habit. */
  recurrenceParent?: string;
}

interface TaskResponse {
  tasks: TaskRow[];
  summary: { pending: number; completed: number; overdue: number; dueToday: number };
}

interface SlotRow {
  _id: string;
  startAt: string;
  endAt: string;
  sessionType: SessionType;
  status: string;
  mentor: { _id: string; name: string; image?: string };
}

interface CompRow {
  _id: string;
  title: string;
  host: string;
  registrationDeadline: string;
  isSaved: boolean;
}

interface PipelineRound {
  _id: string;
  type: keyof typeof ROUND_TYPE_META;
  label: string;
  scheduledAt: string | null;
  outcome: string;
}

interface PipelineRow {
  _id: string;
  company: string;
  role: string;
  stage: string;
  rounds: PipelineRound[];
  intelAvailable: number;
}

/**
 * The next placement round, and whether the campus already knows anything about
 * that company. This is the panel that ties the modules together: a round on
 * Thursday is a reason to book a mock and to read the intel, both one tap away.
 */
function PipelinePanel() {
  const { data, loading } = useApiQuery<{ applications: PipelineRow[] }>('/api/applications', {
    stage: 'open',
  });

  const upcoming = ((data?.applications ?? []) as PipelineRow[])
    .flatMap((application) =>
      application.rounds
        .filter((round) => round.outcome === 'pending' && round.scheduledAt)
        .map((round) => ({ application, round }))
    )
    .sort(
      (a, b) =>
        new Date(a.round.scheduledAt!).getTime() - new Date(b.round.scheduledAt!).getTime()
    )
    .slice(0, 3);

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle}>
          <Target size={16} style={{ color: 'var(--violet)' }} />
          Next rounds
        </h3>
        <Link href="/pipeline" className={styles.panelLink}>
          Pipeline <ArrowRight size={12} />
        </Link>
      </div>

      <div className={styles.panelBody}>
        {loading ? (
          <div className="skeleton" style={{ height: 46, margin: 'var(--s-2)' }} />
        ) : upcoming.length === 0 ? (
          <p className={styles.miniEmpty}>
            Nothing scheduled. Track the companies you are chasing and every round you log pulls
            up what your campus was already asked there.
          </p>
        ) : (
          upcoming.map(({ application, round }) => {
            const deadline = describeDeadline(round.scheduledAt);
            const meta = ROUND_TYPE_META[round.type];

            return (
              <Link key={round._id} href="/pipeline" className={styles.miniRow}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className={cn(styles.miniTitle, 'truncate')}>
                    {round.label || meta.label} · {application.company}
                  </div>
                  <div className={styles.miniMeta}>
                    {deadline.text}
                    {application.intelAvailable > 0 &&
                      ` · ${application.intelAvailable} logged from your campus`}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}

/** Greeting keyed to local time — small, but it makes the app feel present. */
function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const { me, checkIn } = useMe();
  const now = useNow();

  const tasks = useApiQuery<TaskResponse>('/api/tasks', { includeCompleted: 'false' });
  const bookings = useApiQuery<{ slots: SlotRow[] }>('/api/sessions', { view: 'bookings', limit: 5 });
  const comps = useApiQuery<{ comps: CompRow[] }>('/api/comps', { saved: 'true' });

  const firstName = me?.name.split(' ')[0] ?? 'there';

  const upcoming = (bookings.data?.slots ?? [])
    .filter((slot) => slot.status === 'booked' && new Date(slot.startAt).getTime() > now)
    .slice(0, 3);

  /*
   * A daily habit is materialised two weeks ahead, so the raw list shows "Read
   * business news" once for every coming day. Today only cares about today's
   * instance: one per habit, and none from later days.
   */
  const endOfToday = endOfDay(new Date(now)).getTime();
  const seenHabits = new Set<string>();
  const nextTasks = (tasks.data?.tasks ?? [])
    .filter((task) => {
      if (task.status === 'completed') return false;
      if (!task.recurrenceParent) return true;
      if (task.dueAt && new Date(task.dueAt).getTime() > endOfToday) return false;
      if (seenHabits.has(task.recurrenceParent)) return false;
      seenHabits.add(task.recurrenceParent);
      return true;
    })
    .slice(0, 5);

  const summary = tasks.data?.summary;

  const savedComps = (comps.data?.comps ?? [])
    .filter((comp) => new Date(comp.registrationDeadline).getTime() > now)
    .slice(0, 3);

  return (
    <>
      <div>
        <h2 className={styles.greeting}>
          {greetingFor()}, {firstName}
        </h2>
        <p className={styles.pageSubtitle}>
          {summary
            ? summary.overdue > 0
              ? `${pluralise(summary.overdue, 'thing')} overdue. Start there.`
              : summary.dueToday > 0
                ? `${pluralise(summary.dueToday, 'task')} due today.`
                : summary.pending > 0
                  ? `${pluralise(summary.pending, 'open task')}, nothing on fire.`
                  : 'Nothing pending. Genuinely.'
            : 'Loading your day…'}
        </p>
      </div>

      {/* A milestone is acknowledged once and never nagged about. */}
      {checkIn?.milestone && (
        <Banner variant="success" icon={<Flame size={16} />} title={`${checkIn.milestone}-day streak`}>
          You have shown up {checkIn.milestone} days running. That is the whole trick.
        </Banner>
      )}

      {me && (
        <div className={styles.statStrip}>
          <Stat value={me.karma} label="Karma" meta="For helping others" tone="teal" />
          <Stat value={me.points} label="Points" meta="For your own work" tone="violet" />
          <Stat
            value={me.streak}
            label="Day streak"
            meta={me.longestStreak > me.streak ? `Best: ${me.longestStreak}` : 'Personal best'}
            tone="amber"
          />
          <Stat
            value={me.sessionsHosted + me.sessionsAttended}
            label="Sessions"
            meta={`${me.sessionsHosted} hosted · ${me.sessionsAttended} attended`}
          />
        </div>
      )}

      <div className={styles.homeColumns}>
        <div className="stack gap-5">
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.panelTitle}>
                <ListChecks size={16} style={{ color: 'var(--teal)' }} />
                Next up
              </h3>
              <Link href="/tasks" className={styles.panelLink}>
                All tasks <ArrowRight size={12} />
              </Link>
            </div>

            <div className={styles.panelBody}>
              {tasks.loading ? (
                <div className="stack gap-2" style={{ padding: 'var(--s-2)' }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 46 }} />
                  ))}
                </div>
              ) : nextTasks.length === 0 ? (
                <p className={styles.miniEmpty}>
                  Nothing pending. Add what is actually due this week so future you does not
                  find out the hard way.
                </p>
              ) : (
                nextTasks.map((task) => {
                  const deadline = describeDeadline(task.dueAt);
                  return (
                    <Link key={task._id} href="/tasks" className={styles.miniRow}>
                      {deadline.urgency === 'overdue' ? (
                        <TriangleAlert size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                      ) : (
                        <CheckCircle2 size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      )}
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className={cn(styles.miniTitle, 'truncate')}>{task.title}</div>
                        <div className={styles.miniMeta}>
                          {task.course ? `${task.course} · ` : ''}
                          {deadline.text}
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.panelTitle}>
                <CalendarClock size={16} style={{ color: 'var(--violet)' }} />
                Your sessions
              </h3>
              <Link href="/sessions" className={styles.panelLink}>
                Find a slot <ArrowRight size={12} />
              </Link>
            </div>

            <div className={styles.panelBody}>
              {bookings.loading ? (
                <div className="stack gap-2" style={{ padding: 'var(--s-2)' }}>
                  {[0, 1].map((i) => (
                    <div key={i} className="skeleton" style={{ height: 46 }} />
                  ))}
                </div>
              ) : upcoming.length === 0 ? (
                <div className={styles.miniEmpty}>
                  <p style={{ marginBottom: 'var(--s-3)' }}>
                    No sessions booked. Seniors have published slots — take one before placement
                    season does the deciding for you.
                  </p>
                  <Link href="/sessions">
                    <Button size="sm" variant="secondary">
                      Browse open slots
                    </Button>
                  </Link>
                </div>
              ) : (
                upcoming.map((slot) => (
                  <Link key={slot._id} href="/sessions?view=bookings" className={styles.miniRow}>
                    <Avatar name={slot.mentor?.name ?? '?'} image={slot.mentor?.image} seed={slot.mentor?._id} size={30} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className={cn(styles.miniTitle, 'truncate')}>
                        {SESSION_TYPE_META[slot.sessionType].label} with {slot.mentor?.name}
                      </div>
                      <div className={styles.miniMeta}>{formatDateTime(slot.startAt)}</div>
                    </div>
                    <Chip tone={SESSION_TYPE_META[slot.sessionType].tone}>
                      {formatDayLabel(slot.startAt)}
                    </Chip>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="stack gap-5">
          <PipelinePanel />

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h3 className={styles.panelTitle}>
                <Swords size={16} style={{ color: 'var(--amber)' }} />
                Tracked comps
              </h3>
              <Link href="/comps" className={styles.panelLink}>
                Browse <ArrowRight size={12} />
              </Link>
            </div>

            <div className={styles.panelBody}>
              {comps.loading ? (
                <div className="skeleton" style={{ height: 46, margin: 'var(--s-2)' }} />
              ) : savedComps.length === 0 ? (
                <p className={styles.miniEmpty}>
                  Nothing tracked yet. Saving a competition puts its registration deadline straight
                  into your task list.
                </p>
              ) : (
                savedComps.map((comp) => {
                  const deadline = describeDeadline(comp.registrationDeadline);
                  return (
                    <Link key={comp._id} href="/comps?saved=true" className={styles.miniRow}>
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className={cn(styles.miniTitle, 'truncate')}>{comp.title}</div>
                        <div className={styles.miniMeta}>
                          {comp.host} · closes {deadline.text}
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          {me && !me.mentorProfile.acceptingBookings && me.canMentor && (
            <Banner
              variant="info"
              icon={<Sparkles size={16} />}
              title="Juniors are looking for slots"
              action={
                <Link href="/profile">
                  <Button size="sm" variant="soft">
                    Set up hosting
                  </Button>
                </Link>
              }
            >
              You can host mocks. Publish a couple of windows a week — you set the cap, and requests
              stop at it.
            </Banner>
          )}

          {me && me.honorCodeAcceptedAt === null && (
            <Banner variant="warning" icon={<TriangleAlert size={16} />} title="Sharing policy unread">
              You need to accept it once before uploading notes.{' '}
              <Link href="/legal/honor-code" style={{ textDecoration: 'underline' }}>
                Read it
              </Link>
              .
            </Banner>
          )}

          <ImpactPanel />
          <CampusPulsePanel />
        </div>
      </div>

      {tasks.error && <div className={styles.errorBox}>{tasks.error}</div>}
    </>
  );
}

/* ───────────────────────── Impact ───────────────────────── */

interface Impact {
  peopleHelped: number;
  questionsLogged: number;
  questionUpvotes: number;
  resourcesShared: number;
  resourceUpvotes: number;
  resourceDownloads: number;
  sessionsHosted: number;
  answersMarkedUseful: number;
}

/**
 * Karma, translated back into what it stands for. "Karma 340" is a number;
 * "you have helped 9 people" is the reason to write a debrief at midnight.
 */
function ImpactPanel() {
  const { data } = useApiQuery<Impact>('/api/me/impact');
  if (!data) return null;

  const cells = [
    { value: data.questionUpvotes, label: 'times your interview intel helped someone prep', show: data.questionsLogged > 0 },
    { value: data.sessionsHosted, label: data.sessionsHosted === 1 ? 'mock you hosted' : 'mocks you hosted', show: data.sessionsHosted > 0 },
    { value: data.resourceDownloads, label: 'downloads of notes you shared', show: data.resourcesShared > 0 },
    { value: data.answersMarkedUseful, label: 'feed answers marked useful', show: data.answersMarkedUseful > 0 },
  ].filter((cell) => cell.show);

  const nothingYet = cells.length === 0;
  const uses = data.questionUpvotes + data.resourceDownloads + data.answersMarkedUseful + data.sessionsHosted;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle}>
          <HeartHandshake size={16} style={{ color: 'var(--teal)' }} />
          Your impact
        </h3>
      </div>
      {nothingYet ? (
        <p className={styles.miniEmpty}>
          Log one question after your next round and it starts preparing someone two seasons from
          now. <Link href="/intel" style={{ textDecoration: 'underline' }}>See the bank</Link>
        </p>
      ) : (
        <>
          <p className={styles.impactLead}>
            {data.peopleHelped > 0 ? (
              <>
                You have helped <em>{pluralise(data.peopleHelped, 'person', 'people')}</em> on your
                campus.
              </>
            ) : uses > 0 ? (
              <>
                What you shared has been used <em>{pluralise(uses, 'time')}</em>.
              </>
            ) : (
              <>Your contributions are in. The first thanks usually takes a week.</>
            )}
          </p>
          <div className={styles.impactGrid}>
            {cells.map((cell) => (
              <div key={cell.label} className={styles.impactCell}>
                <div className={styles.impactValue}>{cell.value}</div>
                <div className={styles.impactLabel}>{cell.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* ───────────────────────── Campus pulse ───────────────────────── */

interface Pulse {
  season: string;
  questions: number;
  questionsThisWeek: number;
  mocks: number;
  resources: number;
  contributors: number;
  goal: { target: number; previous: number; fraction: number; complete: boolean };
}

/**
 * One bar the whole batch pushes together. The leaderboard ranks people
 * against each other and is opt-in for that reason; this ranks nobody.
 */
function CampusPulsePanel() {
  const { me } = useMe();
  const { data } = useApiQuery<Pulse>('/api/campus/pulse');
  if (!data || !me) return null;

  const remaining = data.goal.target - data.questions;

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle}>
          <Users size={16} style={{ color: 'var(--violet)' }} />
          {me.campus} · {data.season}
        </h3>
        <Link href="/intel" className={styles.panelLink}>
          Intel <ArrowRight size={12} />
        </Link>
      </div>
      <div className={styles.pulseBody}>
        <div className={styles.pulseGoal}>
          <span className={styles.pulseGoalText}>
            {data.goal.complete
              ? 'Every milestone passed. Legendary batch.'
              : `Season goal: ${data.goal.target} interview questions`}
          </span>
          <span className={styles.pulseGoalCount}>
            {data.questions}/{data.goal.target}
          </span>
        </div>
        <div
          className={styles.pulseTrack}
          role="progressbar"
          aria-label="Campus question goal"
          aria-valuemin={data.goal.previous}
          aria-valuemax={data.goal.target}
          aria-valuenow={data.questions}
        >
          <div className={styles.pulseFill} style={{ width: `${Math.max(4, data.goal.fraction * 100)}%` }} />
        </div>
        <div className={styles.pulseStats}>
          <div className={styles.pulseStat}>
            <strong>{data.mocks}</strong>
            mocks run
          </div>
          <div className={styles.pulseStat}>
            <strong>{data.resources}</strong>
            notes shared
          </div>
          <div className={styles.pulseStat}>
            <strong>{data.contributors}</strong>
            contributors
          </div>
        </div>
        <p className={styles.pulseNote}>
          {data.goal.complete
            ? 'The bank is deeper than any batch before it. Keep it fresh.'
            : data.questionsThisWeek > 0
              ? `${pluralise(data.questionsThisWeek, 'question')} logged this week. ${remaining} more and the campus hits ${data.goal.target}.`
              : `${remaining} more and the campus hits ${data.goal.target}. Every debrief counts for everyone.`}
        </p>
      </div>
    </section>
  );
}
