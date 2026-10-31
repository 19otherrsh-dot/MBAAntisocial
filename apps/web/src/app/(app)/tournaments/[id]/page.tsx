'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Trophy, Users, CalendarClock, Share2 } from 'lucide-react';
import { topics } from '@mba/shared/realtime';
import Button, { LinkButton } from '@/components/ui/Button';
import { Avatar, Banner, Chip, EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { useTopic, isEvent } from '@/lib/client/realtime';
import { cn, formatDateTime } from '@/lib/utils';
import gs from '@/components/games/games.module.css';
import styles from '../../app.module.css';

interface PlayerRef { _id: string; name: string; image: string; rating: number | null }
interface MatchView { key: string; round: number; slot: number; players: Array<PlayerRef | null>; winner: string | null; status: string; room: string | null; deadline?: string; mine: boolean }
interface TournamentView {
  _id: string; game: string; title: string; description: string; format: 'single_elimination' | 'round_robin';
  status: 'registration' | 'running' | 'finished' | 'cancelled'; startsAt: string; maxEntrants: number; matchWindowMinutes: number;
  currentRound: number; createdBy: string; entrants: Array<PlayerRef | null>; registered: boolean; matches: MatchView[];
  standings: Array<{ player: PlayerRef | null; points: number; played: number }>; winner: PlayerRef | null;
}

function roundName(round: number, total: number) {
  const fromEnd = total - round;
  return fromEnd === 0 ? 'Final' : fromEnd === 1 ? 'Semi-finals' : fromEnd === 2 ? 'Quarter-finals' : `Round ${round}`;
}

export default function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const { me } = useMe();
  const { data, error, refetch, mutate } = useApiQuery<{ tournament: TournamentView; game: { id: string; title: string } | null; canManage: boolean }>(`/api/tournaments/${id}`);
  const [busy, setBusy] = useState<string | null>(null);

  useTopic(topics.tournament(id), (envelope) => {
    if (isEvent(envelope, 'tournament.updated')) refetch();
  });

  const t = data?.tournament;
  const rounds = useMemo(() => {
    if (!t) return [];
    const byRound = new Map<number, MatchView[]>();
    for (const m of t.matches) byRound.set(m.round, [...(byRound.get(m.round) ?? []), m].sort((a, b) => a.slot - b.slot));
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  }, [t]);

  if (error) return <EmptyState title="Tournament not found" body={error} action={<LinkButton href="/tournaments">All tournaments</LinkButton>} />;
  if (!data || !t) return <div className="skeleton" style={{ height: 360 }} />;

  const act = async (action: 'register' | 'withdraw' | 'start' | 'cancel') => {
    if (action === 'cancel' && !(await confirm({ title: 'Cancel the tournament?', body: 'Everyone entered gets told. This cannot be undone.', confirmLabel: 'Cancel it', destructive: true }))) return;
    setBusy(action);
    try {
      const { tournament } = await api.post<{ tournament: TournamentView }>(`/api/tournaments/${id}`, { action });
      mutate((current) => ({ ...current, tournament }));
    } catch (caught) {
      toast.error('That did not work', errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const myMatch = t.matches.find((m) => m.mine && (m.status === 'ready' || m.status === 'playing'));
  const totalRounds = rounds.length;

  return (
    <div className="stack gap-5">
      <Link href="/tournaments" className="row gap-1 dim" style={{ fontSize: 'var(--t-sm)' }}><ArrowLeft size={14} /> Tournaments</Link>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{t.title}</h1>
          <p className={styles.pageSubtitle}>{data.game?.title} · {t.format === 'round_robin' ? 'Round robin' : 'Knockout'} · {t.matchWindowMinutes >= 1440 ? `${t.matchWindowMinutes / 1440} day` : `${t.matchWindowMinutes} min`} per match</p>
          <div className="row gap-2 wrap" style={{ marginTop: 6 }}>
            <Chip outline icon={<Users size={12} />}>{t.entrants.length}/{t.maxEntrants}</Chip>
            <Chip outline icon={<CalendarClock size={12} />}>{formatDateTime(t.startsAt)}</Chip>
          </div>
        </div>
        <div className="row gap-2 wrap">
          <Button variant="ghost" icon={<Share2 size={15} />} onClick={() => { void navigator.clipboard?.writeText(window.location.href); toast.success('Link copied'); }}>Share</Button>
          {t.status === 'registration' && (t.registered ? (
            <Button variant="secondary" loading={busy === 'withdraw'} onClick={() => act('withdraw')}>Withdraw</Button>
          ) : (
            <Button loading={busy === 'register'} onClick={() => act('register')} disabled={t.entrants.length >= t.maxEntrants}>{t.entrants.length >= t.maxEntrants ? 'Full' : 'Enter'}</Button>
          ))}
          {data.canManage && t.status === 'registration' && <Button variant="secondary" loading={busy === 'start'} onClick={() => act('start')} disabled={t.entrants.length < 2}>Start now</Button>}
          {data.canManage && (t.status === 'registration' || t.status === 'running') && <Button variant="ghost" loading={busy === 'cancel'} onClick={() => act('cancel')}>Cancel</Button>}
        </div>
      </div>

      {t.description && <p className="muted">{t.description}</p>}

      {t.status === 'finished' && t.winner && (
        <Banner variant="success" icon={<Trophy size={18} />} title={`Champion: ${t.winner.name}`}>{t.winner._id === me?.id ? 'That’s you. Congratulations!' : 'Well played, everyone.'}</Banner>
      )}
      {t.status === 'cancelled' && <Banner variant="info" title="This tournament was cancelled" />}
      {myMatch && myMatch.room && (
        <Banner variant="warning" title="Your match is ready" action={<LinkButton href={`/games/room/${myMatch.room}`} size="sm" icon={<Play size={14} />}>Go to table</LinkButton>}>
          vs {myMatch.players.find((p) => p && p._id !== me?.id)?.name ?? 'your opponent'}{myMatch.deadline ? ` · play by ${formatDateTime(myMatch.deadline)}` : ''}
        </Banner>
      )}

      {t.status === 'registration' ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}><Users size={15} /> Entered <span className={styles.sectionCount}>{t.entrants.length}</span></div>
          <div className={gs.seats}>
            {t.entrants.map((p) => p && (
              <Link key={p._id} href={`/u/${p._id}`} className={gs.seat} style={{ color: 'inherit' }}>
                <Avatar name={p.name} image={p.image} seed={p._id} size={30} />
                <div className="stack" style={{ minWidth: 0 }}>
                  <strong className="truncate">{p.name}</strong>
                  <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{p.rating ? `Rating ${p.rating}` : 'Unrated'}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : t.format === 'single_elimination' ? (
        <section className={styles.section}>
          <div className={styles.sectionHead}><Trophy size={15} /> Bracket</div>
          <div className={gs.bracket}>
            {rounds.map(([round, matches]) => (
              <div key={round} className={gs.round}>
                <div className={gs.roundTitle}>{roundName(round, totalRounds)}</div>
                {matches.map((m) => <MatchCard key={m.key} match={m} />)}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHead}><Trophy size={15} /> Standings</div>
            <table className={gs.board}>
              <thead><tr><th>#</th><th>Player</th><th className={gs.num}>Points</th><th className={gs.num}>Played</th></tr></thead>
              <tbody>
                {t.standings.map((s, i) => s.player && (
                  <tr key={s.player._id} className={cn(s.player._id === me?.id && gs.meRow)}>
                    <td>{i + 1}</td>
                    <td className="row gap-2"><Avatar name={s.player.name} image={s.player.image} seed={s.player._id} size={22} /> {s.player.name}</td>
                    <td className={gs.num}>{s.points}</td>
                    <td className={gs.num}>{s.played}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHead}>Rounds</div>
            <div className={gs.bracket}>
              {rounds.map(([round, matches]) => (
                <div key={round} className={gs.round} style={{ justifyContent: 'flex-start' }}>
                  <div className={gs.roundTitle}>Round {round}{round === t.currentRound && t.status === 'running' ? ' · now' : ''}</div>
                  {matches.map((m) => <MatchCard key={m.key} match={m} />)}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {dialog}
    </div>
  );
}

function MatchCard({ match }: { match: MatchView }) {
  const body = (
    <div className={cn(gs.match, match.mine && gs.matchMine)}>
      {match.players.map((p, i) => (
        <div key={i} className={cn(gs.matchPlayer, match.winner && (p?._id === match.winner ? gs.matchWinner : gs.matchLoser))}>
          {p ? <Avatar name={p.name} image={p.image} seed={p._id} size={20} /> : <span style={{ width: 20 }} />}
          <span className="truncate" style={{ flex: 1 }}>{p?.name ?? (match.status === 'bye' ? 'Bye' : 'TBD')}</span>
          {match.winner && p?._id === match.winner && <Trophy size={12} />}
        </div>
      ))}
      {(match.status === 'ready' || match.status === 'playing') && <div className="dim" style={{ fontSize: 10, padding: '2px 10px 6px' }}>Live</div>}
    </div>
  );
  return match.room && match.status !== 'bye' ? <Link href={`/games/room/${match.room}`} style={{ color: 'inherit' }}>{body}</Link> : body;
}
