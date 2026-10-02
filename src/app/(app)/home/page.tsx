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
} from 'lucide-react';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { Chip, Stat, Banner, Avatar } from '@/components/ui/Display';
import Button from '@/components/ui/Button';
import {
  cn,
  describeDeadline,
  formatDateTime,
  formatDayLabel,
  pluralise,
  timeAgo,
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

  const tasks = useApiQuery<TaskResponse>('/api/tasks', { includeCompleted: 'false' });
  const bookings = useApiQuery<{ slots: SlotRow[] }>('/api/sessions', { view: 'bookings', limit: 5 });
  const comps = useApiQuery<{ comps: CompRow[] }>('/api/comps', { saved: 'true' });

  const firstName = me?.name.split(' ')[0] ?? 'there';

  const upcoming = (bookings.data?.slots ?? [])
    .filter((slot) => slot.status === 'booked' && new Date(slot.startAt) > new Date())
    .slice(0, 3);

  const nextTasks = (tasks.data?.tasks ?? [])
    .filter((task) => task.status !== 'completed')
    .slice(0, 5);

  const summary = tasks.data?.summary;

  const savedComps = (comps.data?.comps ?? [])
    .filter((comp) => new Date(comp.registrationDeadline) > new Date())
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

          {me && (
            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h3 className={styles.panelTitle}>Where you stand</h3>
                <Link href="/leaderboard" className={styles.panelLink}>
                  Standings <ArrowRight size={12} />
                </Link>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.miniRow}>
                  <div className="grow">
                    <div className={styles.miniTitle}>{me.campus}</div>
                    <div className={styles.miniMeta}>
                      Joined {timeAgo(me.joinedAt)}
                      {me.leaderboardOptIn ? ' · on the board' : ' · not ranked'}
                    </div>
                  </div>
                </div>
                {!me.leaderboardOptIn && (
                  <p className={styles.miniEmpty} style={{ paddingTop: 0 }}>
                    Ranking is off by default. Turn it on in your profile if you want to be listed.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {tasks.error && <div className={styles.errorBox}>{tasks.error}</div>}
    </>
  );
}
