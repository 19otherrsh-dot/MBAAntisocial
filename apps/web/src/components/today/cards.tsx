'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  CalendarClock,
  CheckCircle2,
  Gamepad2,
  HeartHandshake,
  ListChecks,
  Newspaper,
  PartyPopper,
  School,
  Swords,
  Target,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { Avatar, Chip } from '@/components/ui/Display';
import Button from '@/components/ui/Button';
import TodayClasses from '@/components/academics/TodayClasses';
import { SESSION_TYPE_META, ROUND_TYPE_META, type SessionType, type RoundType } from '@/lib/constants';
import { cn, describeDeadline, formatDayLabel, formatTime, pluralise } from '@/lib/utils';
import type { TodayCards } from './types';
import styles from '@/app/(app)/app.module.css';
import ts from './today.module.css';

function Panel({ icon, title, link, children }: { icon: React.ReactNode; title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className={styles.panel} data-reveal="">
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle}>
          {icon}
          {title}
        </h3>
        {link && (
          <Link href={link.href} className={styles.panelLink}>
            {link.label} <ArrowRight size={12} />
          </Link>
        )}
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

const when = (iso: string) => `${formatDayLabel(iso)} · ${formatTime(iso)}`;

export function ClassesCard({ classes, onChanged }: { classes: TodayCards['classes']; onChanged: () => void }) {
  return (
    <Panel icon={<School size={16} style={{ color: 'var(--blue)' }} />} title="Classes" link={{ href: '/timetable', label: 'Timetable' }}>
      <div className={ts.inset}>
        <TodayClasses classes={classes} onChanged={onChanged} compact />
      </div>
    </Panel>
  );
}

export function TasksCard({ tasks }: { tasks: TodayCards['tasks'] }) {
  const rest = tasks.pending - tasks.items.length;
  return (
    <Panel icon={<ListChecks size={16} style={{ color: 'var(--teal)' }} />} title="Due" link={{ href: '/tasks', label: 'All tasks' }}>
      {tasks.items.length === 0 ? (
        <p className={styles.miniEmpty}>Nothing due today.{tasks.pending > 0 ? ` ${pluralise(tasks.pending, 'open task')} for later in the week.` : ''}</p>
      ) : (
        <>
          {tasks.items.map((task) => {
            const deadline = describeDeadline(task.dueAt);
            return (
              <Link key={task.id} href="/tasks" className={styles.miniRow}>
                {task.overdue ? (
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
          })}
          {rest > 0 && <p className={ts.more}>{pluralise(rest, 'more open task')} later on.</p>}
        </>
      )}
    </Panel>
  );
}

export function AgendaCard({ agenda }: { agenda: TodayCards['agenda'] }) {
  return (
    <Panel icon={<CalendarClock size={16} style={{ color: 'var(--violet)' }} />} title="Coming up" link={{ href: '/sessions', label: 'Find a slot' }}>
      {agenda.length === 0 ? (
        <div className={styles.miniEmpty}>
          <p style={{ marginBottom: 'var(--s-3)' }}>No sessions or rounds in the next two days.</p>
          <Link href="/sessions">
            <Button size="sm" variant="secondary">Browse open slots</Button>
          </Link>
        </div>
      ) : (
        agenda.map((item) =>
          item.kind === 'session' ? (
            <Link key={item.id} href="/sessions?view=bookings" className={styles.miniRow}>
              {item.with ? <Avatar name={item.with.name} image={item.with.image} seed={item.with.id} size={30} /> : <Users size={18} />}
              <div className="grow" style={{ minWidth: 0 }}>
                <div className={cn(styles.miniTitle, 'truncate')}>
                  {SESSION_TYPE_META[item.sessionType as SessionType]?.label ?? 'Session'} {item.role === 'host' ? 'for' : 'with'} {item.with?.name ?? 'someone'}
                </div>
                <div className={styles.miniMeta}>{when(item.startAt)}{item.role === 'host' ? ' · you are hosting' : ''}</div>
              </div>
            </Link>
          ) : (
            <Link key={item.id} href="/pipeline" className={styles.miniRow}>
              <Target size={18} style={{ color: 'var(--violet)', flexShrink: 0 }} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className={cn(styles.miniTitle, 'truncate')}>
                  {item.label || ROUND_TYPE_META[item.roundType as RoundType]?.label || 'Round'} · {item.company}
                </div>
                <div className={styles.miniMeta}>{when(item.startAt)} · read the intel first</div>
              </div>
            </Link>
          )
        )
      )}
    </Panel>
  );
}

export function BriefingCard({ briefing, quiz }: { briefing?: TodayCards['briefing']; quiz?: TodayCards['quiz'] }) {
  return (
    <Panel icon={<Newspaper size={16} style={{ color: 'var(--amber)' }} />} title="Five minutes of news" link={briefing ? { href: '/briefing', label: 'Briefing' } : undefined}>
      <div className={ts.inset}>
        {briefing?.headline ? (
          <Link href="/briefing" className={ts.headline}>
            <span className={ts.headlineTitle}>{briefing.headline.title}</span>
            <span className={styles.miniMeta}>
              {briefing.headline.source}
              {briefing.count > 1 ? ` · and ${briefing.count - 1} more worth knowing for GDs` : ''}
            </span>
          </Link>
        ) : (
          briefing && <p className={styles.miniMeta}>Today’s briefing lands in the morning.</p>
        )}
        {quiz && (
          <div className={ts.quizRow}>
            <Brain size={16} style={{ color: 'var(--violet)', flexShrink: 0 }} />
            {quiz.played ? (
              <span className={ts.quizText}>
                Quiz done: <strong>{quiz.score}/{quiz.total}</strong>. Answers and explanations are on the quiz page.
              </span>
            ) : (
              <>
                <span className={ts.quizText}>{quiz.total} questions on business and current affairs.</span>
                <Link href="/quiz">
                  <Button size="sm" variant="soft">Take the quiz</Button>
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Offered once a day, privately; once done it simply disappears. */
export function CheckInCard() {
  return (
    <Link href="/wellbeing" className={ts.checkIn} data-reveal="">
      <HeartHandshake size={18} style={{ color: 'var(--rose)', flexShrink: 0 }} />
      <span className="grow">
        <strong>How is today going?</strong>
        <span className={styles.miniMeta}> A private, thirty-second check-in. Only you see it.</span>
      </span>
      <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
    </Link>
  );
}

export function EventsCard({ events }: { events: TodayCards['events'] }) {
  if (events.length === 0) return null;
  return (
    <Panel icon={<PartyPopper size={16} style={{ color: 'var(--rose)' }} />} title="On campus" link={{ href: '/events', label: 'Events' }}>
      {events.map((event) => (
        <Link key={event.id} href={`/events/${event.id}`} className={styles.miniRow}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className={cn(styles.miniTitle, 'truncate')}>{event.title}</div>
            <div className={styles.miniMeta}>
              {when(event.startAt)}
              {event.venue ? ` · ${event.venue}` : ''}
            </div>
          </div>
          {event.going ? <Chip tone="teal">Going</Chip> : event.goingCount > 0 && <span className={styles.miniMeta}>{event.goingCount} going</span>}
        </Link>
      ))}
    </Panel>
  );
}

export function CompsCard({ comps }: { comps: TodayCards['comps'] }) {
  if (comps.length === 0) return null;
  return (
    <Panel icon={<Swords size={16} style={{ color: 'var(--amber)' }} />} title="Registrations closing" link={{ href: '/comps?saved=true', label: 'Saved' }}>
      {comps.map((comp) => (
        <Link key={comp.id} href="/comps?saved=true" className={styles.miniRow}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className={cn(styles.miniTitle, 'truncate')}>{comp.title}</div>
            <div className={styles.miniMeta}>
              {comp.host} · closes {describeDeadline(comp.registrationDeadline).text}
            </div>
          </div>
        </Link>
      ))}
    </Panel>
  );
}

export function GamesCard({ games }: { games: TodayCards['games'] }) {
  if (games.length === 0) return null;
  return (
    <Panel icon={<Gamepad2 size={16} style={{ color: 'var(--blue)' }} />} title="Your table is waiting" link={{ href: '/games', label: 'Games' }}>
      {games.map((room) => (
        <Link key={room.id} href={`/games/room/${room.id}`} className={styles.miniRow}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className={cn(styles.miniTitle, 'truncate')}>{room.gameName}</div>
            <div className={styles.miniMeta}>
              {room.tournament ? 'Tournament match · ' : ''}
              {room.status === 'playing' ? 'In progress' : 'In the lobby'}
            </div>
          </div>
          <Chip tone="violet">Rejoin</Chip>
        </Link>
      ))}
    </Panel>
  );
}

export function OpenEditionCard({ data }: { data: TodayCards['openEdition'] }) {
  return (
    <Panel icon={<Users size={16} style={{ color: 'var(--accent)' }} />} title="Already open to you">
      <div className={ts.inset}>
        <p className={styles.miniMeta} style={{ marginBottom: 'var(--s-3)' }}>
          Your campus unlocks the full Campus Edition once enough of your batch joins. Until then, these work today:
        </p>
        <div className={ts.openLinks}>
          <Link href="/sessions?scope=cross" className={ts.openLink}>
            <strong>{data.crossCampusSlots > 0 ? pluralise(data.crossCampusSlots, 'open slot') : 'Mentor slots'}</strong>
            <span>with seniors and alumni from other campuses</span>
          </Link>
          <Link href="/opportunities" className={ts.openLink}>
            <strong>Opportunities</strong>
            <span>competitions, internships, live projects</span>
          </Link>
          <Link href="/insights" className={ts.openLink}>
            <strong>Placement insights</strong>
            <span>what actually moves outcomes</span>
          </Link>
        </div>
      </div>
    </Panel>
  );
}
