'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Users, Globe2, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState } from '@/components/ui/Display';
import { useApiQuery, useAction, useNow } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import { formatTime } from '@/lib/utils';
import styles from '../app.module.css';

interface Room {
  _id: string;
  title: string;
  topic: string;
  campus: string;
  isGlobal: boolean;
  createdBy: { _id: string; name: string; image: string };
  expiresAt: string;
}

/** "Closes in 3h" — rooms are temporary, so the time left is the useful fact. */
function closesIn(expiresAt: string, now: number): string {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60_000));
  if (minutes < 60) return `Closes in ${minutes} min`;
  return `Closes in ${Math.round(minutes / 60)}h`;
}

export default function RoomsPage() {
  const now = useNow();
  const { data: rooms, loading, error, refetch } = useApiQuery<Room[]>('/api/rooms');
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Study rooms</h2>
          <p className={styles.pageSubtitle}>
            Live rooms for cracking cases and cramming midterms. They close by themselves.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} icon={<Plus size={16} />}>
          Open a room
        </Button>
      </div>

      {error && <Banner variant="danger">{error}</Banner>}

      {loading ? (
        <div className={styles.cardGrid}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 120 }} />
          ))}
        </div>
      ) : !rooms?.length ? (
        <EmptyState
          art={<Users size={40} strokeWidth={1.4} />}
          title="No rooms open right now"
          body="Open one for tonight's case prep or tomorrow's exam, and whoever is up will find it."
          action={<Button onClick={() => setCreating(true)}>Open a room</Button>}
        />
      ) : (
        <div className={styles.cardGrid}>
          {rooms.map((room) => (
            <Link key={room._id} href={`/rooms/${room._id}`} className={styles.resourceCard}>
              <div className="row gap-3">
                <Avatar name={room.createdBy.name} image={room.createdBy.image} seed={room.createdBy._id} size={32} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className={`${styles.resourceTitle} truncate`}>{room.title}</div>
                  <div className="dim truncate" style={{ fontSize: 'var(--t-xs)' }}>
                    Opened by {room.createdBy.name}
                  </div>
                </div>
              </div>
              <div className="row gap-2 wrap">
                <Chip tone="violet">{room.topic}</Chip>
                {room.isGlobal && (
                  <Chip tone="blue" icon={<Globe2 size={11} />}>
                    All campuses
                  </Chip>
                )}
                <Chip outline icon={<Clock size={11} />} title={`Closes at ${formatTime(room.expiresAt)}`}>
                  {closesIn(room.expiresAt, now)}
                </Chip>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateRoomDialog
        open={creating}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          refetch();
        }}
      />
    </>
  );
}

function CreateRoomDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [scope, setScope] = useState<'campus' | 'global'>('campus');
  const [hours, setHours] = useState('3');

  const create = useAction(async () => {
    await api.post('/api/rooms', {
      title: title.trim(),
      topic: topic.trim(),
      isGlobal: scope === 'global',
      durationHours: Number(hours),
    });
    setTitle('');
    setTopic('');
    onDone();
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Open a study room"
      description="Anyone on your campus can join while it is open. Messages disappear when it closes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.pending}>
            Cancel
          </Button>
          <Button
            onClick={() => create.run()}
            loading={create.pending}
            disabled={title.trim().length < 3 || topic.trim().length < 2}
          >
            Open room
          </Button>
        </>
      }
    >
      {create.error && <Banner variant="danger">{create.error}</Banner>}
      <Input
        label="What are you working on?"
        placeholder="Guesstimate grind before Bain"
        value={title}
        maxLength={100}
        onChange={(event) => setTitle(event.target.value)}
        autoFocus
      />
      <Input
        label="Topic"
        placeholder="Consulting, Finance, Term II exams…"
        value={topic}
        maxLength={50}
        onChange={(event) => setTopic(event.target.value)}
      />
      <div className={styles.checkGrid}>
        <Select
          label="Who can join"
          value={scope}
          onChange={(event) => setScope(event.target.value as 'campus' | 'global')}
          options={[
            { value: 'campus', label: 'My campus' },
            { value: 'global', label: 'All campuses' },
          ]}
        />
        <Select
          label="Stays open for"
          value={hours}
          onChange={(event) => setHours(event.target.value)}
          options={[
            { value: '1', label: '1 hour' },
            { value: '3', label: '3 hours' },
            { value: '6', label: '6 hours' },
            { value: '12', label: '12 hours' },
            { value: '24', label: '24 hours' },
          ]}
        />
      </div>
    </Dialog>
  );
}
