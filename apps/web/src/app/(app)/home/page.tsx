'use client';

import Link from 'next/link';
import { Check, Flame, Sparkles, TriangleAlert } from 'lucide-react';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { Stat, Banner } from '@/components/ui/Display';
import { LinkButton } from '@/components/ui/Button';
import {
  AgendaCard,
  BriefingCard,
  CheckInCard,
  ClassesCard,
  CompsCard,
  EventsCard,
  GamesCard,
  OpenEditionCard,
  TasksCard,
} from '@/components/today/cards';
import type { TodayResponse } from '@/components/today/types';
import { pluralise } from '@/lib/utils';
import styles from '../app.module.css';
import ts from '@/components/today/today.module.css';

/** Greeting keyed to local time — small, but it makes the app feel present. */
function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** One honest sentence about the day. Never guilt, never manufactured urgency. */
function daySummary(cards: TodayResponse['cards']): string {
  const parts: string[] = [];
  const classes = cards.classes?.length ?? 0;
  if (classes) parts.push(pluralise(classes, 'class', 'classes'));
  if (cards.tasks?.overdue) parts.push(`${pluralise(cards.tasks.overdue, 'thing')} overdue`);
  if (cards.tasks?.dueToday) parts.push(`${cards.tasks.dueToday} due today`);
  const sessions = cards.agenda?.filter((a) => a.kind === 'session').length ?? 0;
  const rounds = cards.agenda?.filter((a) => a.kind === 'round').length ?? 0;
  if (sessions) parts.push(pluralise(sessions, 'session'));
  if (rounds) parts.push(pluralise(rounds, 'round'));
  if (parts.length === 0) return 'A clear day. Use it however you like.';
  const sentence = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.${cards.tasks?.overdue ? ' Start with the overdue one.' : ''}`;
}

export default function TodayPage() {
  const { me, checkIn } = useMe();
  const { data, error, refetch } = useApiQuery<TodayResponse>('/api/today');
  const cards = data?.cards;
  const firstName = me?.name.split(' ')[0] ?? 'there';

  return (
    <>
      <div data-aurora="">
        <h1 className={styles.greeting} data-title-in="">
          {greetingFor()}, {firstName}
        </h1>
        <p className={styles.pageSubtitle}>{cards ? daySummary(cards) : 'Loading your day…'}</p>
      </div>

      {/* A milestone is acknowledged once and never nagged about. */}
      {checkIn?.milestone && (
        <Banner variant="success" icon={<Flame size={16} />} title={`${checkIn.milestone}-day streak`}>
          You have shown up {checkIn.milestone} days running. That is the whole trick.
        </Banner>
      )}

      {me && (
        <div className={styles.statStrip} data-reveal="">
          <Stat value={me.streak} label="Day streak" meta={me.longestStreak > me.streak ? `Best: ${me.longestStreak}` : 'Personal best'} tone="amber" />
          <Stat value={me.points} label="Points" meta="For your own work" tone="violet" />
          <Stat value={me.karma} label="Karma" meta="For helping others" tone="teal" />
          <Stat value={me.sessionsHosted + me.sessionsAttended} label="Sessions" meta={`${me.sessionsHosted} hosted · ${me.sessionsAttended} attended`} />
        </div>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}

      {!cards ? (
        !error && (
          <div className={styles.homeColumns} aria-busy="true">
            <div className="stack gap-5">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 150, borderRadius: 'var(--r-lg)' }} />)}
            </div>
            <div className="stack gap-5">
              {[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 150, borderRadius: 'var(--r-lg)' }} />)}
            </div>
          </div>
        )
      ) : (
        <div className={styles.homeColumns}>
          <div className="stack gap-5">
            {cards.classes && <ClassesCard classes={cards.classes} onChanged={refetch} />}
            {cards.tasks && <TasksCard tasks={cards.tasks} />}
            {cards.agenda && <AgendaCard agenda={cards.agenda} />}
          </div>

          <div className="stack gap-5">
            {cards.openEdition && <OpenEditionCard data={cards.openEdition} />}
            {(cards.briefing || cards.quiz) && <BriefingCard briefing={cards.briefing} quiz={cards.quiz} />}
            {cards.checkIn && !cards.checkIn.done && <CheckInCard />}
            {cards.games && <GamesCard games={cards.games} />}
            {cards.events && <EventsCard events={cards.events} />}
            {cards.comps && <CompsCard comps={cards.comps} />}

            {me && !me.mentorProfile.acceptingBookings && me.canMentor && (
              <Banner
                variant="info"
                icon={<Sparkles size={16} />}
                title="Juniors are looking for slots"
                action={
                  <LinkButton href="/profile" size="sm" variant="soft">Set up hosting</LinkButton>
                }
              >
                You can host mocks. Publish a couple of windows a week — you set the cap, and requests stop at it.
              </Banner>
            )}

            {me && me.honorCodeAcceptedAt === null && data.edition === 'campus' && (
              <Banner variant="warning" icon={<TriangleAlert size={16} />} title="Sharing policy unread">
                You need to accept it once before uploading notes.{' '}
                <Link href="/legal/honor-code" style={{ textDecoration: 'underline' }}>Read it</Link>.
              </Banner>
            )}

            {data.failed.length > 0 && (
              <p className={styles.miniMeta}>Some of today couldn’t load ({data.failed.join(', ')}). It will be back on the next refresh.</p>
            )}
          </div>
        </div>
      )}

      {cards && (
        <div className={ts.end}>
          <span className={ts.endMark}><Check size={16} /></span>
          <span className={ts.endTitle}>That’s today.</span>
          <span>Everything else can wait until tomorrow.</span>
        </div>
      )}
    </>
  );
}
