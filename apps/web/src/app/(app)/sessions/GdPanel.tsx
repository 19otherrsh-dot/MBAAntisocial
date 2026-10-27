'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Users, Video, CalendarPlus, Shuffle, X, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState, RatingInput } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery, useAction, useNow } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api, errorMessage } from '@/lib/client/api';
import { formatDateTime, toDateTimeLocalValue } from '@/lib/utils';
import styles from '../app.module.css';

interface GdPerson { _id: string; name: string; image?: string; year?: number }
interface GdRoom {
  _id: string;
  topic: string;
  brief: string;
  startAt: string;
  durationMinutes: number;
  capacity: number;
  status: string;
  origin: 'hosted' | 'matched';
  moderator?: GdPerson;
  participants: GdPerson[];
  meetingLink: string;
  joined: boolean;
  moderating: boolean;
  feedback: Array<{ user: string; scores: Record<string, number>; comment: string }>;
}
interface GdResponse {
  open: GdRoom[];
  mine: GdRoom[];
  queue: { windows: string[]; track: string } | null;
  rubric: Array<{ key: string; label: string; help: string }>;
}

/** Next few evenings at 6, 7, 8, 9pm — the windows people actually pick. */
function suggestedWindows(): Date[] {
  const out: Date[] = [];
  for (let d = 0; d < 4; d += 1) {
    for (const h of [18, 19, 20, 21]) {
      const w = new Date();
      w.setDate(w.getDate() + d);
      w.setHours(h, 0, 0, 0);
      if (w.getTime() > Date.now() + 30 * 60_000) out.push(w);
    }
  }
  return out.slice(0, 12);
}

export default function GdPanel() {
  const toast = useToast();
  const { me } = useMe();
  const { data, loading, refetch } = useApiQuery<GdResponse>('/api/gd');
  const [queueOpen, setQueueOpen] = useState(false);
  const [hostOpen, setHostOpen] = useState(false);
  const [scoring, setScoring] = useState<GdRoom | null>(null);

  const act = async (room: GdRoom, action: string, success: string) => {
    try {
      await api.patch(`/api/gd/${room._id}`, { action });
      toast.success(success);
      refetch();
    } catch (caught) {
      toast.error('That did not go through', errorMessage(caught));
    }
  };

  const leaveQueue = async () => {
    await api.delete('/api/gd');
    toast.success('Left the queue');
    refetch();
  };

  if (loading || !data) return <div className="skeleton" style={{ height: 240 }} />;

  const upcomingMine = data.mine.filter((r) => r.status === 'scheduled' || r.status === 'live');
  const pastMine = data.mine.filter((r) => r.status === 'completed');
  const joinable = data.open.filter((r) => !r.joined && !r.moderating);

  return (
    <>
      <div className={styles.gdHero}>
        <div>
          <h3 className={styles.settingsTitle}>Group discussion practice</h3>
          <p className={styles.settingsHint}>
            Pick the evenings you are free. As soon as four people share a window, a room forms — topic, link, and all.
          </p>
        </div>
        <div className="row gap-2 wrap">
          {data.queue ? (
            <>
              <Chip tone="violet" icon={<Shuffle size={12} />}>In the queue for {data.queue.windows.length} window{data.queue.windows.length === 1 ? '' : 's'}</Chip>
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={leaveQueue}>Leave queue</Button>
            </>
          ) : (
            <Button icon={<Shuffle size={16} />} onClick={() => setQueueOpen(true)}>Match me into a GD</Button>
          )}
          {me?.canMentor && (
            <Button variant="secondary" icon={<CalendarPlus size={16} />} onClick={() => setHostOpen(true)}>Moderate a GD</Button>
          )}
        </div>
      </div>

      {upcomingMine.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionHead}>Your upcoming GDs</h3>
          <div className={styles.cardList}>
            {upcomingMine.map((room) => (
              <GdCard key={room._id} room={room} onLeave={() => act(room, 'leave', 'You left the GD')} onCancel={() => act(room, 'cancel', 'GD cancelled')}
                onComplete={() => act(room, 'complete', 'GD closed — credits added')} onScore={() => setScoring(room)} />
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionHead}>Open rooms you can join</h3>
        {joinable.length === 0 ? (
          <EmptyState art={<Users size={36} strokeWidth={1.4} />} title="No open rooms right now" body="Join the queue and one forms around you — or ask a senior to moderate one." />
        ) : (
          <div className={styles.cardList}>
            {joinable.map((room) => (
              <GdCard key={room._id} room={room} onJoin={() => act(room, 'join', 'You’re in — the link is on the card')} />
            ))}
          </div>
        )}
      </section>

      {pastMine.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.sectionHead}>Past GDs & feedback</h3>
          <div className={styles.cardList}>
            {pastMine.map((room) => (
              <GdCard key={room._id} room={room} rubric={data.rubric} myId={me?.id} onScore={room.moderating ? () => setScoring(room) : undefined} />
            ))}
          </div>
        </section>
      )}

      <QueueDialog open={queueOpen} onClose={() => setQueueOpen(false)} onDone={(formed) => {
        setQueueOpen(false);
        toast.success(formed ? 'Matched! Your GD is below.' : 'You’re in the queue', formed ? undefined : 'We’ll notify you the moment a room forms.');
        refetch();
      }} />
      <HostDialog open={hostOpen} onClose={() => setHostOpen(false)} onDone={() => { setHostOpen(false); refetch(); }} />
      <ScoreDialog room={scoring} rubric={data.rubric} onClose={() => setScoring(null)} onDone={() => { setScoring(null); refetch(); }} />
    </>
  );
}

function GdCard({ room, onJoin, onLeave, onCancel, onComplete, onScore, rubric, myId }: {
  room: GdRoom;
  onJoin?: () => void;
  onLeave?: () => void;
  onCancel?: () => void;
  onComplete?: () => void;
  onScore?: () => void;
  rubric?: GdResponse['rubric'];
  myId?: string;
}) {
  const now = useNow();
  const started = new Date(room.startAt).getTime() < now;
  const mine = room.feedback.find((f) => f.user === myId);
  return (
    <article className={styles.slotCard}>
      <div className={styles.slotMain}>
        <div className={styles.slotTop}>
          <Chip tone="blue">GD</Chip>
          <Chip outline>{formatDateTime(room.startAt)}</Chip>
          <Chip outline>{room.durationMinutes} min</Chip>
          <Chip outline icon={<Users size={12} />}>{room.participants.length}/{room.capacity}</Chip>
          {room.origin === 'matched' && <Chip tone="violet">Auto-matched</Chip>}
          {room.status === 'completed' && <Chip tone="teal">Done</Chip>}
        </div>
        <div className={styles.slotName} style={{ fontSize: 'var(--t-md)' }}>{room.topic}</div>
        {room.brief && <p className={styles.slotNote}>{room.brief}</p>}
        <div className="row gap-2 wrap">
          {room.moderator && <span className="dim" style={{ fontSize: 'var(--t-sm)' }}>Moderated by {room.moderator.name} ·</span>}
          {room.participants.slice(0, 8).map((p) => <Avatar key={p._id} name={p.name} image={p.image} seed={p._id} size={24} />)}
        </div>
        {mine && rubric && (
          <div className={styles.feedbackBlock}>
            <span className="eyebrow">Moderator’s feedback</span>
            <div className={styles.feedbackScores}>
              {rubric.map((c) => (
                <span key={c.key} className={styles.feedbackScore}>{c.label}<span className={styles.feedbackScoreValue}>{mine.scores[c.key] ?? '—'}/5</span></span>
              ))}
            </div>
            {mine.comment && <p className={styles.feedbackComment}>{mine.comment}</p>}
          </div>
        )}
        <div className={styles.slotActions}>
          {(room.joined || room.moderating) && room.meetingLink && room.status !== 'completed' && (
            room.meetingLink.includes('/meet/')
              ? <Link href={new URL(room.meetingLink).pathname}><Button size="sm" icon={<Video size={15} />}>Join room</Button></Link>
              : <a href={room.meetingLink} target="_blank" rel="noopener noreferrer"><Button size="sm" icon={<Video size={15} />}>Join room</Button></a>
          )}
          {onJoin && <Button size="sm" onClick={onJoin}>Join this GD</Button>}
          {room.joined && onLeave && !started && <Button size="sm" variant="ghost" onClick={onLeave}>Leave</Button>}
          {room.moderating && started && room.status !== 'completed' && onComplete && (
            <Button size="sm" variant="secondary" icon={<CheckCircle2 size={15} />} onClick={onComplete}>Close out</Button>
          )}
          {room.moderating && onScore && room.participants.length > 0 && started && <Button size="sm" variant="soft" onClick={onScore}>Score participants</Button>}
          {room.moderating && !started && onCancel && <Button size="sm" variant="dangerGhost" onClick={onCancel}>Cancel</Button>}
        </div>
      </div>
    </article>
  );
}

function QueueDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (formed: boolean) => void }) {
  const windows = useMemo(() => suggestedWindows(), []);
  const [picked, setPicked] = useState<number[]>([]);
  const join = useAction(async () => {
    const result = await api.post<{ formed: string[] }>('/api/gd', { mode: 'queue', windows: picked.map((t) => new Date(t).toISOString()) });
    setPicked([]);
    onDone(result.formed.length > 0);
  });
  if (!open) return null;
  return (
    <Dialog open onClose={onClose} title="When are you free?" description="Pick every window that works. More windows, faster match."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => join.run()} loading={join.pending} disabled={picked.length === 0}>Join the queue</Button></>}>
      {join.error && <Banner variant="danger">{join.error}</Banner>}
      <div className={styles.checkGrid}>
        {windows.map((w) => {
          const t = w.getTime();
          const on = picked.includes(t);
          return (
            <button key={t} type="button" aria-pressed={on} className={`${styles.checkTile} ${on ? styles.checkTileActive : ''}`}
              onClick={() => setPicked(on ? picked.filter((x) => x !== t) : [...picked, t])}>
              {w.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })} · {w.toLocaleTimeString('en-IN', { hour: 'numeric' })}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}

function HostDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const start = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    return toDateTimeLocalValue(d);
  }, []);
  const [form, setForm] = useState({ topic: '', brief: '', startAt: start, durationMinutes: '30', capacity: '8' });
  const host = useAction(async () => {
    await api.post('/api/gd', { mode: 'host', ...form, startAt: new Date(form.startAt).toISOString(), durationMinutes: Number(form.durationMinutes), capacity: Number(form.capacity) });
    toast.success('GD published', 'Juniors can join it now.');
    onDone();
  });
  if (!open) return null;
  return (
    <Dialog open onClose={onClose} title="Moderate a GD" description="You run the room and score each participant afterwards."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => host.run()} loading={host.pending}>Publish</Button></>}>
      {host.error && <Banner variant="danger">{host.error}</Banner>}
      <Input label="Topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Should India adopt a four-day work week?" />
      <Textarea label="Brief" optional value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} rows={3} />
      <Input label="Starts at" type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
      <div className="row gap-3">
        <Select label="Length" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} options={['20', '30', '45', '60'].map((v) => ({ value: v, label: `${v} min` }))} />
        <Select label="Seats" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} options={['4', '5', '6', '7', '8', '10'].map((v) => ({ value: v, label: v }))} />
      </div>
    </Dialog>
  );
}

function ScoreDialog({ room, rubric, onClose, onDone }: { room: GdRoom | null; rubric: GdResponse['rubric']; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const save = useAction(async () => {
    if (!room) return;
    const feedback = room.participants
      .filter((p) => scores[p._id] && Object.keys(scores[p._id]).length === rubric.length)
      .map((p) => ({ userId: p._id, scores: scores[p._id], comment: comments[p._id] ?? '' }));
    await api.patch(`/api/gd/${room._id}`, { action: 'feedback', feedback });
    toast.success('Feedback sent');
    onDone();
  });
  if (!room) return null;
  return (
    <Dialog open wide onClose={onClose} title="Score the room" description="Each person sees only their own scores."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => save.run()} loading={save.pending}>Send feedback</Button></>}>
      {save.error && <Banner variant="danger">{save.error}</Banner>}
      {room.participants.map((p) => (
        <div key={p._id} className={styles.settingsGroup} style={{ padding: 'var(--s-3)' }}>
          <div className="row gap-2"><Avatar name={p.name} image={p.image} seed={p._id} size={24} /><strong>{p.name}</strong></div>
          {rubric.map((c) => (
            <div key={c.key} className="between gap-3 wrap">
              <span style={{ fontSize: 'var(--t-sm)' }}>{c.label}</span>
              <RatingInput label={`${c.label} for ${p.name}`} value={scores[p._id]?.[c.key] ?? null}
                onChange={(v) => setScores({ ...scores, [p._id]: { ...(scores[p._id] ?? {}), [c.key]: v } })} />
            </div>
          ))}
          <Input label="One thing to work on" optional value={comments[p._id] ?? ''} onChange={(e) => setComments({ ...comments, [p._id]: e.target.value })} />
        </div>
      ))}
    </Dialog>
  );
}
