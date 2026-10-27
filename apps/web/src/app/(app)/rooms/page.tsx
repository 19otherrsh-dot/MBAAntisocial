'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Users, Globe2, Building2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar, Chip, EmptyState } from '@/components/ui/Display';
import { useApiQuery, useAction } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import { useMe } from '@/lib/client/me';
import styles from '../app.module.css';

interface Room {
  _id: string;
  title: string;
  topic: string;
  campus: string;
  isGlobal: boolean;
  createdBy: {
    _id: string;
    name: string;
    image: string;
    badges: string[];
  };
  expiresAt: string;
}

interface CreateRoomInput {
  title: string;
  topic: string;
  isGlobal: boolean;
  durationHours: number;
}

export default function RoomsPage() {
  const { me } = useMe();
  const { data: rooms, loading, error, refetch } = useApiQuery<Room[]>('/api/rooms');
  const [isCreating, setIsCreating] = useState(false);

  const { run: createRoom, pending: isSubmitting } = useAction(async (payload: CreateRoomInput) => {
    await api.post<Room>('/api/rooms', payload);
    setIsCreating(false);
    refetch();
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await createRoom({
      title: String(formData.get('title') ?? ''),
      topic: String(formData.get('topic') ?? ''),
      isGlobal: formData.get('scope') === 'global',
      durationHours: Number(formData.get('durationHours')),
    });
  };

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Study Rooms</h2>
          <p className={styles.pageSubtitle}>
            Ephemeral live chat rooms for cracking cases and cramming midterms.
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} icon={<Plus size={16} />}>
          Create
        </Button>
      </div>

      {isCreating && (
        <form onSubmit={handleSubmit} className="surface-card">
          <h3 className="h4" style={{ marginBottom: 'var(--s-4)' }}>New Study Room</h3>
          
          <div className="row gap-4" style={{ marginBottom: 'var(--s-4)' }}>
            <div className="field flex-1">
              <label htmlFor="title" className="label">Title</label>
              <input 
                id="title" 
                name="title" 
                className="input" 
                placeholder="e.g. McKinsey Frameworks" 
                required 
                minLength={3} 
                maxLength={100} 
              />
            </div>
            <div className="field flex-1">
              <label htmlFor="topic" className="label">Topic</label>
              <input 
                id="topic" 
                name="topic" 
                className="input" 
                placeholder="e.g. Consulting" 
                required 
                minLength={2} 
                maxLength={50} 
              />
            </div>
          </div>

          <div className="row gap-4" style={{ marginBottom: 'var(--s-5)' }}>
            <div className="field flex-1">
              <label htmlFor="scope" className="label">Scope</label>
              <select id="scope" name="scope" className="input">
                <option value="campus">{me?.campus} Only</option>
                <option value="global">Nationwide (Global)</option>
              </select>
            </div>
            <div className="field flex-1">
              <label htmlFor="durationHours" className="label">Duration</label>
              <select id="durationHours" name="durationHours" className="input">
                <option value="4">4 hours</option>
                <option value="12">12 hours</option>
                <option value="24">24 hours (Max)</option>
              </select>
            </div>
          </div>

          <div className="row gap-3">
            <Button type="button" variant="soft" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Open Room'}
            </Button>
          </div>
        </form>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : !rooms?.length ? (
        <EmptyState
          art={<Users size={40} strokeWidth={1.4} />}
          title="No active rooms"
          body="Start a new room to gather people for a case comp or exam prep."
        />
      ) : (
        <div className={styles.grid}>
          {rooms.map((room) => (
            <Link key={room._id} href={`/rooms/${room._id}`} className="surface-card">
              <div className="row gap-3" style={{ marginBottom: 'var(--s-3)' }}>
                <Avatar 
                  name={room.createdBy.name} 
                  image={room.createdBy.image} 
                  seed={room.createdBy._id} 
                  size={32} 
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 className="truncate" style={{ fontSize: 'var(--t-sm)', fontWeight: 600 }}>
                    {room.title}
                  </h4>
                  <div className="dim truncate" style={{ fontSize: 'var(--t-xs)' }}>
                    Host: {room.createdBy.name}
                  </div>
                </div>
                {room.isGlobal ? (
                  <Globe2 size={16} className="dim" />
                ) : (
                  <Building2 size={16} className="dim" />
                )}
              </div>
              
              <div className="row gap-2 wrap">
                <Chip tone="slate">{room.topic}</Chip>
                {room.isGlobal && <Chip outline>Global</Chip>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
