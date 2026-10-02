'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trophy, Flame, EyeOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar, Banner, Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { cn, formatCount, pluralise } from '@/lib/utils';
import { BADGE_BY_ID } from '@/lib/constants';
import styles from '../app.module.css';

type Track = 'karma' | 'points';
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
}

interface LeaderboardResponse {
  track: Track;
  scope: Scope;
  campus: string;
  rows: Row[];
  me: { optedIn: boolean; rank: number | null; points: number; karma: number; streak: number };
}

export default function LeaderboardPage() {
  const { me } = useMe();
  const [track, setTrack] = useState<Track>('karma');
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
            {data?.campus ?? me?.campus} · {pluralise(rows.length, 'person')} taking part
          </p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Segmented
          ariaLabel="Leaderboard track"
          value={track}
          onChange={setTrack}
          options={[
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
        {track === 'karma'
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
        <div className={styles.board}>
          {rows.map((row, index) => {
            const isMe = row._id === me?.id;
            const score = track === 'karma' ? row.karma : row.points;
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
                  <div className={styles.boardScoreLabel}>{track}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {optedIn && data?.me.rank && (
        <p className="dim" style={{ fontSize: 'var(--t-sm)', textAlign: 'center' }}>
          You are ranked #{data.me.rank} on {track} {scope === 'global' ? 'globally' : `at ${data.campus}`}.
        </p>
      )}
    </>
  );
}
