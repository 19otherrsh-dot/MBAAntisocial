'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trophy, Users, CalendarClock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { formatDateTime, toDateTimeLocalValue } from '@/lib/utils';
import GameArt from '@/components/games/GameArt';
import gs from '@/components/games/games.module.css';
import styles from '../app.module.css';

type Scope = 'active' | 'mine' | 'past';

interface TournamentRow {
  _id: string;
  title: string;
  game: string;
  gameTitle: string;
  format: 'single_elimination' | 'round_robin';
  status: 'registration' | 'running' | 'finished' | 'cancelled';
  startsAt: string;
  entrants: number;
  maxEntrants: number;
  registered: boolean;
  winner: string | null;
}

const STATUS_LABEL: Record<TournamentRow['status'], string> = { registration: 'Open for entries', running: 'In progress', finished: 'Finished', cancelled: 'Cancelled' };

export default function TournamentsPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}>
      <Tournaments />
    </Suspense>
  );
}

function Tournaments() {
  const params = useSearchParams();
  const [scope, setScope] = useState<Scope>('active');
  const [createOpen, setCreateOpen] = useState(Boolean(params.get('game')));
  const { data } = useApiQuery<{ tournaments: TournamentRow[]; games: Array<{ id: string; title: string }> }>('/api/tournaments', { scope });

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Tournaments</h1>
          <p className={styles.pageSubtitle}>Rated brackets and round robins for your section, club, or the whole campus.</p>
        </div>
        <Button icon={<Plus size={15} />} onClick={() => setCreateOpen(true)} disabled={data?.games.length === 0}>Run a tournament</Button>
      </div>

      <Segmented ariaLabel="Which tournaments" value={scope} onChange={setScope} options={[{ value: 'active', label: 'Upcoming & live' }, { value: 'mine', label: 'Mine' }, { value: 'past', label: 'Past' }]} />

      {!data ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : data.tournaments.length === 0 ? (
        <EmptyState
          art={<Trophy size={36} strokeWidth={1.4} />}
          title={scope === 'past' ? 'No past tournaments yet' : 'Nothing running right now'}
          body={data.games.length === 0 ? 'Tournaments open up once a tournament-ready game is published.' : 'Start one — pick a game, a time, and share the link.'}
        />
      ) : (
        <div className={gs.grid}>
          {data.tournaments.map((t) => (
            <Link key={t._id} href={`/tournaments/${t._id}`} className={gs.card}>
              <GameArt id={t.game} title={t.gameTitle} />
              <div className={gs.cardBody}>
                <span className={gs.cardTitle}>{t.title}</span>
                <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>{t.gameTitle} · {t.format === 'round_robin' ? 'Round robin' : 'Knockout'}</span>
                <div className={gs.cardMeta}>
                  <Chip tone={t.status === 'registration' ? 'teal' : t.status === 'running' ? 'amber' : 'slate'}>{STATUS_LABEL[t.status]}</Chip>
                  {t.registered && <Chip tone="violet">You’re in</Chip>}
                </div>
                <div className={gs.cardMeta}>
                  <span className="row gap-1"><Users size={12} /> {t.entrants}/{t.maxEntrants}</span>
                  <span className="row gap-1"><CalendarClock size={12} /> {formatDateTime(t.startsAt)}</span>
                  {t.winner && <span className="row gap-1"><Trophy size={12} /> {t.winner}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {createOpen && data && <CreateTournamentDialog games={data.games} initialGame={params.get('game') ?? undefined} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function CreateTournamentDialog({ games, initialGame, onClose }: { games: Array<{ id: string; title: string }>; initialGame?: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    gameId: games.some((g) => g.id === initialGame) ? initialGame! : games[0]?.id ?? '',
    title: '',
    description: '',
    format: 'single_elimination',
    maxEntrants: 16,
    startsAt: toDateTimeLocalValue(new Date(Date.now() + 24 * 60 * 60_000)),
    matchWindowMinutes: 30,
  }));
  const [busy, setBusy] = useState(false);

  if (games.length === 0) {
    return (
      <Dialog open onClose={onClose} title="Run a tournament" footer={<Button onClick={onClose}>OK</Button>}>
        <p className="muted">No tournament-ready game has been published yet.</p>
      </Dialog>
    );
  }

  const create = async () => {
    setBusy(true);
    try {
      const { tournament } = await api.post<{ tournament: { _id: string } }>('/api/tournaments', { ...form, startsAt: new Date(form.startsAt).toISOString() });
      router.push(`/tournaments/${tournament._id}`);
    } catch (caught) {
      toast.error('Could not create it', errorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Run a tournament" description="You are entered automatically. Seeding is by rating; matches open as rounds begin."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={create} loading={busy} disabled={form.title.trim().length < 3}>Create</Button></>}>
      <Select label="Game" value={form.gameId} onChange={(e) => setForm({ ...form, gameId: e.target.value })} options={games.map((g) => ({ value: g.id, label: g.title }))} />
      <Input label="Name" placeholder="Section B Chess Cup" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Textarea label="Details" optional rows={2} placeholder="Prizes, rules, who it is for…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="row gap-3 wrap">
        <Select label="Format" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} options={[{ value: 'single_elimination', label: 'Knockout' }, { value: 'round_robin', label: 'Round robin (≤12)' }]} />
        <Select label="Max players" value={String(form.maxEntrants)} onChange={(e) => setForm({ ...form, maxEntrants: Number(e.target.value) })} options={[4, 8, 16, 32, 64].map((n) => ({ value: String(n), label: String(n) }))} />
      </div>
      <div className="row gap-3 wrap">
        <Input label="Starts" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
        <Select label="Time per match" value={String(form.matchWindowMinutes)} onChange={(e) => setForm({ ...form, matchWindowMinutes: Number(e.target.value) })}
          options={[{ value: '15', label: '15 minutes' }, { value: '30', label: '30 minutes' }, { value: '60', label: '1 hour' }, { value: '1440', label: '1 day' }, { value: '4320', label: '3 days' }]} />
      </div>
    </Dialog>
  );
}
