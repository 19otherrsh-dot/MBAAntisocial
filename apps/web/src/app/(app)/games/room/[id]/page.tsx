'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Bot, Check, Copy, Crown, Eye, Globe2, Lock, Play, Share2, Trophy, UserPlus, X } from 'lucide-react';
import { topics } from '@mba/shared/realtime';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useDebounced } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import { useTopic, isEvent } from '@/lib/client/realtime';
import { cn } from '@/lib/utils';
import type { RoomView } from '@/components/games/types';
import gs from '@/components/games/games.module.css';
import styles from '../../../app.module.css';

interface RoomResponse {
  room: RoomView;
  game: { id: string; title: string; minPlayers: number; maxPlayers: number; botBackfill: boolean; spectators: boolean; orientation: string } | null;
  me: { seated: boolean; seat: number | null; host: boolean; spectating: boolean; reported: boolean };
}

/**
 * The lobby: who is seated, who is ready, the code to share. When the host
 * starts, every seated player is taken to the player automatically.
 */
export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const { me } = useMe();
  const { data, error, mutate, refetch } = useApiQuery<RoomResponse>(`/api/games/rooms/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rematchFrom, setRematchFrom] = useState<string | null>(null);

  const room = data?.room;
  const listening = Boolean(data?.me.seated || data?.me.spectating);

  // onSubscribed: anyone who sat down before the subscription landed (e.g. straight after a rematch) shows up.
  useTopic(listening ? topics.gameRoom(id) : null, (envelope) => {
    if (isEvent(envelope, 'game.room.updated')) {
      const next = envelope.data.room as RoomView;
      mutate((current) => ({ ...current, room: next, me: { ...current.me, host: next.host === me?.id, seated: next.seats.some((s) => s.user?._id === me?.id) } }));
    } else if (isEvent(envelope, 'game.room.rematch')) {
      setRematchFrom(envelope.data.from);
      refetch();
    }
  }, { onSubscribed: refetch });

  /** Opens the rematch lobby, or sits down at the one another player opened. */
  const rematch = async () => {
    setBusy('rematch');
    try {
      const { room: next } = await api.post<{ room: RoomView }>(`/api/games/rooms/${id}`, { action: 'rematch' });
      router.push(`/games/room/${next._id}`);
    } catch (caught) {
      toast.error('Could not set up the rematch', errorMessage(caught));
      setBusy(null);
    }
  };

  // Without a realtime service the lobby still moves, just less instantly.
  useEffect(() => {
    if (!room || room.status === 'finished' || room.status === 'abandoned') return;
    const timer = setInterval(refetch, 8000);
    return () => clearInterval(timer);
  }, [room, refetch]);

  // The host pressed start: off to the table.
  useEffect(() => {
    if (room?.status === 'playing' && data?.me.seated) router.push(`/player/${room.game}?room=${room._id}`);
  }, [room?.status, room?.game, room?._id, data?.me.seated, router]);

  const act = async (key: string, body: Record<string, unknown>, after?: (r: RoomView) => void) => {
    setBusy(key);
    try {
      const { room: next } = await api.post<{ room: RoomView }>(`/api/games/rooms/${id}`, body);
      if (next) {
        mutate((current) => ({ ...current, room: next, me: { ...current.me, host: next.host === me?.id, seated: next.seats.some((s) => s.user?._id === me?.id), spectating: body.action === 'spectate' || current.me.spectating } }));
        after?.(next);
      }
      return true;
    } catch (caught) {
      toast.error('That did not work', errorMessage(caught));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const link = typeof window !== 'undefined' ? `${window.location.origin}/games/room/${id}` : '';
  const share = async () => {
    const text = `Join my ${data?.game?.title ?? 'game'} table — code ${room?.code}`;
    if (navigator.share) await navigator.share({ title: data?.game?.title, text, url: link }).catch(() => undefined);
    else {
      await navigator.clipboard?.writeText(`${text}\n${link}`);
      toast.success('Invite copied');
    }
  };

  const mySeat = useMemo(() => room?.seats.find((s) => s.user?._id === me?.id), [room, me]);
  if (error) return <EmptyState title="Table not found" body={error} action={<Link href="/games"><Button>All games</Button></Link>} />;
  if (!data || !room) return <div className="skeleton" style={{ height: 360 }} />;

  const isHost = data.me.host;
  const humans = room.seats.filter((s) => !s.isBot && s.user);
  const everyoneReady = humans.every((s) => s.ready || s.user?._id === room.host);
  const canStart = isHost && room.status === 'lobby' && room.seats.length >= room.minPlayers && everyoneReady;
  const emptySeats = Array.from({ length: room.maxPlayers }, (_, i) => i).filter((i) => !room.seats.some((s) => s.seat === i));
  const startHint =
    room.seats.length < room.minPlayers
      ? `Needs ${room.minPlayers - room.seats.length} more player${room.minPlayers - room.seats.length === 1 ? '' : 's'}`
      : !everyoneReady
        ? 'Waiting for everyone to be ready'
        : '';

  return (
    <div className="stack gap-5" style={{ maxWidth: 820 }}>
      <Link href={`/games/${room.game}`} className="row gap-1 dim" style={{ fontSize: 'var(--t-sm)' }}><ArrowLeft size={14} /> {data.game?.title ?? 'Game'}</Link>

      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>{data.game?.title} table</h1>
          <div className="row gap-2 wrap" style={{ marginTop: 6 }}>
            {room.mode === 'tournament' ? <Chip tone="amber" icon={<Trophy size={12} />}>Tournament match</Chip> : room.visibility === 'private' ? <Chip outline icon={<Lock size={12} />}>Private</Chip> : <Chip outline icon={<Globe2 size={12} />}>Open to campus</Chip>}
            {room.rated ? <Chip tone="violet">Rated</Chip> : <Chip>Casual</Chip>}
            {room.spectatorCount > 0 && <Chip outline icon={<Eye size={12} />}>{room.spectatorCount} watching</Chip>}
          </div>
        </div>
        {room.status === 'lobby' && room.mode !== 'tournament' && (
          <div className="stack gap-1" style={{ alignItems: 'flex-end' }}>
            <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Table code</span>
            <button className={cn(gs.code, 'row gap-2')} onClick={() => { void navigator.clipboard?.writeText(room.code); toast.success('Code copied'); }} aria-label="Copy table code">
              {room.code} <Copy size={16} className="dim" />
            </button>
          </div>
        )}
      </div>

      {room.status === 'finished' && (
        <Banner variant={room.disputed ? 'warning' : 'success'} title={room.disputed ? 'Result disputed' : 'Game over'}>
          {room.disputed ? 'Players reported different results, so ratings did not change.' : room.result?.summary || 'The result has been recorded.'}
        </Banner>
      )}
      {room.status === 'abandoned' && <Banner variant="info" title="This table closed">Nobody is here any more. Open a new one from the game page.</Banner>}
      {room.status === 'playing' && !data.me.seated && (
        <Banner variant="info" title="Game in progress" action={data.game?.spectators ? (
          <Button size="sm" icon={<Eye size={14} />} loading={busy === 'watch'} onClick={() => act('watch', { action: 'spectate' }, () => router.push(`/player/${room.game}?room=${room._id}`))}>Watch</Button>
        ) : undefined}>
          {data.game?.spectators ? 'You can watch live.' : 'This game does not allow spectators.'}
        </Banner>
      )}

      <section className={gs.seats} aria-label="Seats">
        {room.seats.map((seat) => (
          <div key={seat.seat} className={cn(gs.seat, seat.ready && gs.seatReady)}>
            {seat.isBot ? (
              <span className="row" style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--surface-hover)', justifyContent: 'center' }}><Bot size={18} /></span>
            ) : (
              <Avatar name={seat.user?.name ?? '?'} image={seat.user?.image} seed={seat.user?._id} size={36} />
            )}
            <div className="stack" style={{ flex: 1, minWidth: 0 }}>
              <strong className="row gap-1 truncate">
                {seat.isBot ? `Bot ${seat.seat + 1}` : seat.user?.name}
                {seat.user?._id === room.host && <Crown size={13} style={{ color: 'var(--amber)' }} aria-label="Host" />}
              </strong>
              <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>
                {seat.left ? 'Left' : seat.isBot ? 'Ready' : room.status === 'lobby' ? (seat.ready || seat.user?._id === room.host ? 'Ready' : 'Not ready') : seat.present ? 'At the table' : 'Away'}
                {seat.user?.rating ? ` · ${seat.user.rating}` : ''}
              </span>
            </div>
            {seat.ready && room.status === 'lobby' && <Check size={16} style={{ color: 'var(--success)' }} aria-hidden />}
            {isHost && room.status === 'lobby' && room.mode !== 'tournament' && seat.user?._id !== me?.id && (
              <button className="dim" aria-label={seat.isBot ? 'Remove bot' : `Remove ${seat.user?.name}`} onClick={() => act(`kick-${seat.seat}`, seat.isBot ? { action: 'remove_bot', seat: seat.seat } : { action: 'kick', userId: seat.user!._id })}>
                <X size={16} />
              </button>
            )}
          </div>
        ))}
        {room.status === 'lobby' &&
          emptySeats.map((seat) => (
            <div key={`empty-${seat}`} className={cn(gs.seat, gs.seatEmpty)}>
              {isHost && data.game?.botBackfill ? (
                <Button size="sm" variant="ghost" icon={<Bot size={14} />} loading={busy === 'bot'} onClick={() => act('bot', { action: 'add_bot' })}>Add a bot</Button>
              ) : (
                <span>Open seat</span>
              )}
            </div>
          ))}
      </section>

      {room.status === 'lobby' && (
        <div className="row gap-2 wrap">
          {!data.me.seated ? (
            <Button size="lg" icon={<Play size={16} />} loading={busy === 'join'} onClick={() => act('join', { action: 'join' })} disabled={emptySeats.length === 0}>
              {emptySeats.length === 0 ? 'Table is full' : 'Take a seat'}
            </Button>
          ) : isHost ? (
            <Button size="lg" icon={<Play size={16} />} loading={busy === 'start'} disabled={!canStart} onClick={() => act('start', { action: 'start' })}>
              Start game
            </Button>
          ) : (
            <Button size="lg" variant={mySeat?.ready ? 'secondary' : 'primary'} icon={<Check size={16} />} loading={busy === 'ready'} onClick={() => act('ready', { action: 'ready', ready: !mySeat?.ready })}>
              {mySeat?.ready ? 'Ready — tap to undo' : 'I’m ready'}
            </Button>
          )}
          {data.me.seated && room.mode !== 'tournament' && (
            <>
              <Button variant="secondary" icon={<UserPlus size={15} />} onClick={() => setInviteOpen(true)}>Invite</Button>
              <Button variant="ghost" icon={<Share2 size={15} />} onClick={share}>Share</Button>
            </>
          )}
          {isHost && room.mode !== 'tournament' && (
            <Button variant="ghost" icon={room.visibility === 'private' ? <Globe2 size={15} /> : <Lock size={15} />} onClick={() => act('vis', { action: 'options', options: room.options, visibility: room.visibility === 'private' ? 'public' : 'private' })}>
              {room.visibility === 'private' ? 'Open to campus' : 'Make private'}
            </Button>
          )}
          <span style={{ flex: 1 }} />
          {data.me.seated && room.mode !== 'tournament' && (
            <Button variant="ghost" loading={busy === 'leave'} onClick={async () => { if (await act('leave', { action: 'leave' })) router.push(`/games/${room.game}`); }}>Leave table</Button>
          )}
        </div>
      )}
      {room.status === 'lobby' && isHost && startHint && <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>{startHint}.</p>}
      {room.status === 'playing' && data.me.seated && (
        <Link href={`/player/${room.game}?room=${room._id}`}><Button size="lg" icon={<Play size={16} />}>Back to the game</Button></Link>
      )}
      {(room.status === 'finished' || room.status === 'abandoned') &&
        (room.tournament ? (
          <Link href={`/tournaments/${room.tournament}`}><Button size="lg" icon={<Trophy size={16} />}>Back to the bracket</Button></Link>
        ) : data.me.seated ? (
          <div className="row gap-3 wrap" style={{ alignItems: 'center' }}>
            <Button size="lg" loading={busy === 'rematch'} onClick={rematch}>{room.rematch ? 'Join the rematch' : 'Play again'}</Button>
            {room.rematch && <span className="muted" role="status">{rematchFrom ? `${rematchFrom} opened a rematch.` : 'A rematch table is open.'}</span>}
          </div>
        ) : (
          <Link href={`/games/${room.game}`}><Button size="lg">Find another game</Button></Link>
        ))}

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} roomId={id} />
    </div>
  );
}

function InviteDialog({ open, onClose, roomId }: { open: boolean; onClose: () => void; roomId: string }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Array<{ id: string; title: string }>>([]);
  const [sending, setSending] = useState(false);
  const query = useDebounced(q.trim(), 250);
  const { data } = useApiQuery<{ groups: Array<{ type: string; results: Array<{ id: string; title: string; subtitle?: string }> }> }>(open && query.length >= 2 ? '/api/search' : null, { q: query });
  const people = (data?.groups.find((g) => g.type === 'person')?.results ?? []).filter((p) => !picked.some((x) => x.id === p.id));
  if (!open) return null;

  const send = async () => {
    setSending(true);
    try {
      const { invited } = await api.post<{ invited: number }>(`/api/games/rooms/${roomId}`, { action: 'invite', userIds: picked.map((p) => p.id) });
      toast.success(`Invited ${invited}`, 'They get a notification with a link to this table.');
      setPicked([]);
      onClose();
    } catch (caught) {
      toast.error('Could not invite', errorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Invite to this table" description="Anyone on your campus can be invited to a game."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={send} loading={sending} disabled={picked.length === 0}>Send {picked.length > 0 ? picked.length : ''}</Button></>}>
      {picked.length > 0 && (
        <div className="row gap-1 wrap">
          {picked.map((p) => (
            <Chip key={p.id} outline>
              {p.title} <button aria-label={`Remove ${p.title}`} onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}><X size={12} /></button>
            </Chip>
          ))}
        </div>
      )}
      <Input autoFocus aria-label="Search people" placeholder="Search your campus…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="stack gap-1">
        {people.map((p) => (
          <button key={p.id} className="row gap-2" style={{ padding: 8, borderRadius: 8, textAlign: 'left' }} onClick={() => picked.length < 10 && setPicked([...picked, { id: p.id, title: p.title }])}>
            <Avatar name={p.title} seed={p.id} size={28} /> {p.title} <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{p.subtitle}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
