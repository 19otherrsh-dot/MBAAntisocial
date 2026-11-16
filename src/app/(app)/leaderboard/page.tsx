'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Trophy, Flame, EyeOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar, Banner, Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { cn, formatCount, pluralise } from '@/lib/utils';
import { BADGE_BY_ID } from '@/lib/constants';
import g from '@/components/game/game.module.css';
import styles from '../app.module.css';

type Track = 'week' | 'karma' | 'points';
type Scope = 'campus' | 'global';

interface Row {
  _id: string;
  name: string;
  image: string;
  year: 1 | 2;
  points: number;
  karma: number;
  streak: number;
  badges: string[];
  campus?: string;
  weekXp?: number;
}

interface LeaderboardResponse {
  track: Track;
  scope: Scope;
  campus: string;
  rows: Row[];
  me: {
    optedIn: boolean;
    rank: number | null;
    points: number;
    karma: number;
    streak: number;
    weekXp?: number;
    gapToNext?: number | null;
  };
}

export default function LeaderboardPage() {
  // `useSearchParams` needs a Suspense boundary to keep the route prerenderable.
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 420 }} />}>
      <Standings />
    </Suspense>
  );
}

function Standings() {
  const { me } = useMe();
  const params = useSearchParams();
  const [track, setTrack] = useState<Track>(() => {
    const requested = params.get('track');
    return requested === 'karma' || requested === 'points' ? requested : 'week';
  });
  const [scope, setScope] = useState<Scope>('campus');

  const { data, loading, error } = useApiQuery<LeaderboardResponse>('/api/leaderboard', { track, scope });

  const rows = data?.rows ?? [];
  const optedIn = data?.me.optedIn ?? false;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Standings</h2>
          <p className={styles.pageSubtitle}>
            {data?.campus ?? me?.campus} · {pluralise(rows.length, 'person', 'people')} taking part
          </p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Segmented
          ariaLabel="Leaderboard track"
          value={track}
          onChange={setTrack}
          options={[
            { value: 'week' as const, label: 'This week' },
            { value: 'karma' as const, label: 'Karma' },
            { value: 'points' as const, label: 'Points' },
          ]}
        />
        <div className={styles.toolbarPush}>
          <Segmented
            ariaLabel="Leaderboard scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'campus' as const, label: 'Campus' },
              { value: 'global' as const, label: 'Global' },
            ]}
          />
        </div>
      </div>

      <Banner variant="info">
        {track === 'week'
          ? 'The weekly league: XP earned since Monday. It resets every week, so anyone can top it.'
          : track === 'karma'
          ? 'Karma comes only from helping other people — hosting sessions, writing feedback, sharing notes. It is the one worth ranking.'
          : 'Points track your own work: tasks finished, streaks held, sessions attended. Useful to you, less interesting to everyone else.'}
      </Banner>

      {!optedIn && !loading && (
        <Banner
          variant="warning"
          icon={<EyeOff size={16} />}
          title="You are not on this board"
          action={
            <Link href="/profile">
              <Button size="sm" variant="soft">
                Change that
              </Button>
            </Link>
          }
        >
          Ranking is off unless you turn it on. Public comparison is a documented stressor for exactly
          this crowd, so it is never the default.
        </Banner>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : rows.length === 0 ? (
        <EmptyState
          art={<Trophy size={40} strokeWidth={1.4} />}
          title="Nobody has opted in yet"
          body="The board fills up as people choose to be listed. Being first is a whole personality, if you want it."
        />
      ) : (
        <>
        {track === 'week' && rows.length >= 3 && <Podium rows={rows.slice(0, 3)} />}
        <div className={styles.board}>
          {rows.map((row, index) => {
            const isMe = row._id === me?.id;
            const score = track === 'week' ? row.weekXp ?? 0 : track === 'karma' ? row.karma : row.points;
            const topBadge = row.badges.map((id) => BADGE_BY_ID.get(id)).find(Boolean);

            return (
              <div key={row._id} className={cn(styles.boardRow, isMe && styles.boardRowMe)}>
                <span className={cn(styles.boardRank, index < 3 && styles.boardRankTop)}>
                  {index + 1}
                </span>

                <div className={styles.boardPerson}>
                  <Avatar name={row.name} image={row.image} seed={row._id} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.boardName}>
                      {row.name}
                      {isMe && <span className="dim"> · you</span>}
                    </div>
                    <div className={cn(styles.boardSub, 'row', 'gap-2')}>
                      <span>{row.year === 2 ? 'Second year' : 'First year'}</span>
                      {scope === 'global' && row.campus && (
                        <span>· {row.campus}</span>
                      )}
                      {row.streak > 2 && (
                        <span className="row gap-1">
                          <Flame size={10} style={{ color: 'var(--amber)' }} />
                          {row.streak}
                        </span>
                      )}
                      {topBadge && <Chip tone="violet">{topBadge.label}</Chip>}
                    </div>
                  </div>
                </div>

                <div>
                  <div className={styles.boardScore}>{formatCount(score)}</div>
                  <div className={styles.boardScoreLabel}>{track === 'week' ? 'XP' : track}</div>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      {optedIn && data?.me.rank && (
        <p className="dim" style={{ fontSize: 'var(--t-sm)', textAlign: 'center' }}>
          You are #{data.me.rank} {track === 'week' ? 'this week' : `on ${track}`}{' '}
          {scope === 'global' ? 'globally' : `at ${data.campus}`}.
          {track === 'week' && data.me.gapToNext ? ` ${data.me.gapToNext} XP to move up a place.` : ''}
        </p>
      )}
    </>
  );
}

/** Top three of the week, on blocks that grow up from the floor. */
function Podium({ rows }: { rows: Row[] }) {
  // Second, first, third: the winner stands in the middle.
  const order = [rows[1], rows[0], rows[2]];
  const blockClass = [g.podium2, g.podium1, g.podium3];
  const place = [2, 1, 3];
  return (
    <div className={g.podium} aria-label="This week's top three">
      {order.map((row, index) => (
        <div key={row._id} className={g.podiumSpot}>
          <Avatar name={row.name} image={row.image} seed={row._id} size={index === 1 ? 56 : 44} />
          <div className={g.podiumName}>{row.name.split(' ')[0]}</div>
          <div className={g.podiumXp}>{row.weekXp ?? 0} XP</div>
          <div className={cn(g.podiumBlock, blockClass[index])}>{place[index]}</div>
        </div>
      ))}
    </div>
  );
}
