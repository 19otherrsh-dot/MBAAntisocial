'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Globe2, Lock, Smartphone, Swords, Trophy, Users, Clock, Zap } from 'lucide-react';
import { GAME_CATEGORY_META } from '@mba/shared/games';
import Button from '@/components/ui/Button';
import { Avatar, Chip, EmptyState, Segmented, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { cn, formatDateTime, timeAgo } from '@/lib/utils';
import GameArt from '@/components/games/GameArt';
import type { GameDetail, RoomView } from '@/components/games/types';
import gs from '@/components/games/games.module.css';
import styles from '../../app.module.css';

type Difficulty = 'easy' | 'medium' | 'hard';

export default function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { me } = useMe();
  const [board, setBoard] = useState<'campus' | 'everyone'>('campus');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error } = useApiQuery<GameDetail>(`/api/games/${id}`, { board });

  if (error) return <EmptyState title="Game not found" body={error} action={<Link href="/games"><Button>All games</Button></Link>} />;
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;
  const { game, playable } = data;

  const run = async (key: string, fn: () => Promise<{ room: RoomView }>) => {
    setBusy(key);
    try {
      const { room } = await fn();
      router.push(`/games/room/${room._id}`);
    } catch (caught) {
      toast.error('Could not open a table', errorMessage(caught));
      setBusy(null);
    }
  };

  const online = game.modes.includes('online') && game.network.transport !== 'none';

  return (
    <div className="stack gap-6">
      <Link href="/games" className="row gap-1 dim" style={{ fontSize: 'var(--t-sm)' }}><ArrowLeft size={14} /> All games</Link>

      <div className={gs.detailHead}>
        <GameArt id={game.id} thumbnail={game.thumbnail} title={game.title} className={gs.detailArt} />
        <div className="stack gap-2">
          <div className="row gap-2 wrap">
            <Chip tone="violet">{GAME_CATEGORY_META[game.category].label}</Chip>
            <Chip outline icon={<Users size={12} />}>{game.minPlayers === game.maxPlayers ? `${game.minPlayers} players` : `${game.minPlayers}–${game.maxPlayers} players`}</Chip>
            <Chip outline icon={<Clock size={12} />}>~{game.estimatedMinutes} min</Chip>
            {game.rated && <Chip outline icon={<Trophy size={12} />}>Rated</Chip>}
            {!playable && <Chip tone="amber">Coming soon</Chip>}
          </div>
          <h1 className={styles.pageTitle}>{game.title}</h1>
          <p className={styles.pageSubtitle}>{game.description || game.tagline}</p>
        </div>
      </div>

      {data.me && (
        <div className="row gap-5 wrap">
          {game.rated && <Stat value={data.me.rating} label="Your rating" meta={`Peak ${data.me.peak}`} />}
          <Stat value={data.me.played} label="Played" />
          <Stat value={data.me.wins} label="Wins" />
          {data.me.draws > 0 && <Stat value={data.me.draws} label="Draws" />}
        </div>
      )}

      {!playable ? (
        <EmptyState
          art={<GameArt id={game.id} title={game.title} className={gs.detailArt} />}
          title="This one is still being built"
          body="It will appear here, ready to play, the moment its build is published. Every other game on the shelf shares your rating history and friends list."
        />
      ) : (
        <section className={gs.modes}>
          {online && (
            <div className={gs.modeCard}>
              <div className={gs.modeTitle}><Zap size={17} /> Quick match</div>
              <p className="muted" style={{ fontSize: 'var(--t-sm)', flex: 1 }}>Jump into the best open table for your rating, on campus first.</p>
              <Button loading={busy === 'quick'} onClick={() => run('quick', () => api.post('/api/games/rooms/quick', { gameId: game.id }))}>Find a game</Button>
            </div>
          )}
          {online && (
            <div className={gs.modeCard}>
              <div className={gs.modeTitle}><Lock size={17} /> Play friends</div>
              <p className="muted" style={{ fontSize: 'var(--t-sm)', flex: 1 }}>A private table with a code to share. Or open it to anyone on campus.</p>
              <div className="row gap-2 wrap">
                <Button variant="secondary" loading={busy === 'private'} onClick={() => run('private', () => api.post('/api/games/rooms', { gameId: game.id, visibility: 'private' }))}>Private table</Button>
                <Button variant="ghost" icon={<Globe2 size={14} />} loading={busy === 'public'} onClick={() => run('public', () => api.post('/api/games/rooms', { gameId: game.id, visibility: 'public', crossCampus: false }))}>Public</Button>
              </div>
            </div>
          )}
          {game.modes.includes('bot') && (
            <div className={gs.modeCard}>
              <div className={gs.modeTitle}><Bot size={17} /> {game.maxPlayers === 1 ? 'Solo' : 'Vs bot'}</div>
              {game.maxPlayers > 1 && (
                <Segmented ariaLabel="Difficulty" value={difficulty} onChange={setDifficulty} options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
              )}
              <span style={{ flex: 1 }} />
              <Link href={`/player/${game.id}?mode=bot&difficulty=${difficulty}`}><Button variant="secondary" style={{ width: '100%' }}>Play</Button></Link>
            </div>
          )}
          {game.modes.includes('local') && (
            <div className={gs.modeCard}>
              <div className={gs.modeTitle}><Smartphone size={17} /> Pass & play</div>
              <p className="muted" style={{ fontSize: 'var(--t-sm)', flex: 1 }}>Everyone on one phone or laptop. Great for the mess table.</p>
              <Link href={`/player/${game.id}?mode=local`}><Button variant="secondary" style={{ width: '100%' }}>Start</Button></Link>
            </div>
          )}
          {game.modes.includes('tournament') && (
            <div className={gs.modeCard}>
              <div className={gs.modeTitle}><Trophy size={17} /> Tournaments</div>
              <p className="muted" style={{ fontSize: 'var(--t-sm)', flex: 1 }}>
                {data.tournaments.length > 0 ? `${data.tournaments.length} open on campus.` : 'Run a bracket for your section or club.'}
              </p>
              <Link href={`/tournaments?game=${game.id}`}><Button variant="ghost" style={{ width: '100%' }}>{data.tournaments.length > 0 ? 'See tournaments' : 'Start one'}</Button></Link>
            </div>
          )}
        </section>
      )}

      {playable && online && (
        <section className={styles.section}>
          <div className={styles.sectionHead}><Swords size={15} /> Open tables <span className={styles.sectionCount}>{data.tables.length}</span></div>
          {data.tables.length === 0 ? (
            <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>No open tables right now — quick match opens one others can find.</p>
          ) : (
            <div className={gs.seats}>
              {data.tables.map((t) => (
                <Link key={t._id} href={`/games/room/${t._id}`} className={gs.seat} style={{ color: 'inherit' }}>
                  <div className="row" style={{ marginRight: 4 }}>
                    {t.seats.slice(0, 3).map((s) => s.user && <Avatar key={s.seat} name={s.user.name} image={s.user.image} seed={s.user._id} size={26} />)}
                  </div>
                  <div className="stack" style={{ minWidth: 0 }}>
                    <strong className="truncate">{t.seats.find((s) => s.user?._id === t.host)?.user?.name ?? 'Table'}’s table</strong>
                    <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{t.seats.length}/{t.maxPlayers} seated{t.campus !== me?.campus ? ` · ${t.campus}` : ''}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--s-5)' }}>
        {game.rated && (
          <section className={styles.section}>
            <div className="row gap-2" style={{ justifyContent: 'space-between' }}>
              <div className={styles.sectionHead}><Trophy size={15} /> Leaderboard</div>
              <Segmented ariaLabel="Leaderboard scope" value={board} onChange={setBoard} options={[{ value: 'campus', label: 'Campus' }, { value: 'everyone', label: 'Everyone' }]} />
            </div>
            {data.leaderboard.length === 0 ? (
              <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>Nobody has a rating yet. One rated game puts you on the board.</p>
            ) : (
              <table className={gs.board}>
                <thead><tr><th>#</th><th>Player</th><th className={gs.num}>Rating</th><th className={gs.num}>W/P</th></tr></thead>
                <tbody>
                  {data.leaderboard.map((row) => (
                    <tr key={row.user._id} className={cn(row.user._id === me?.id && gs.meRow)}>
                      <td>{row.rank}</td>
                      <td>
                        <Link href={`/u/${row.user._id}`} className="row gap-2" style={{ color: 'inherit' }}>
                          <Avatar name={row.user.name} image={row.user.image} seed={row.user._id} size={24} />
                          <span className="truncate">{row.user.name}</span>
                          {board === 'everyone' && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{row.user.campus}</span>}
                        </Link>
                      </td>
                      <td className={gs.num}>{row.rating}</td>
                      <td className={gs.num}>{row.wins}/{row.played}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        <section className={styles.section}>
          <div className={styles.sectionHead}><Clock size={15} /> Your recent games</div>
          {data.history.length === 0 ? (
            <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>Nothing yet.</p>
          ) : (
            <table className={gs.board}>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h._id}>
                    <td>{h.placement === 1 ? '🏆' : h.placement ? `#${h.placement}` : '–'}</td>
                    <td>
                      <div className="stack">
                        <span>{h.mode === 'bot' ? 'vs Bot' : h.mode === 'local' ? 'Pass & play' : `vs ${h.opponents.join(', ') || '—'}`}</span>
                        <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{h.summary || h.mode} · {timeAgo(h.finishedAt)}</span>
                      </div>
                    </td>
                    <td className={gs.num}>{h.delta !== null ? <span style={{ color: h.delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>{h.delta >= 0 ? '+' : ''}{h.delta}</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {data.tournaments.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}><Trophy size={15} /> Tournaments</div>
          <div className="stack gap-2">
            {data.tournaments.map((t) => (
              <Link key={t._id} href={`/tournaments/${t._id}`} className={gs.seat} style={{ color: 'inherit' }}>
                <Trophy size={18} />
                <div className="stack" style={{ flex: 1, minWidth: 0 }}>
                  <strong className="truncate">{t.title}</strong>
                  <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{t.status === 'registration' ? `Starts ${formatDateTime(t.startsAt)}` : 'In progress'} · {t.entrants}/{t.maxEntrants}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
