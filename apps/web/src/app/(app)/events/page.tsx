'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, MapPin, Plus, Users, PartyPopper } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Chip, EmptyState, Segmented } from '@/components/ui/Display';
import { Select } from '@/components/ui/Field';
import { useApiQuery } from '@/lib/client/hooks';
import { formatTime } from '@/lib/utils';
import EventDialog, { EVENT_CATEGORY_LABEL } from '@/components/campus/EventDialog';
import CalendarFeedButton from '@/components/academics/CalendarFeedButton';
import cs from '@/components/campus/campus.module.css';
import styles from '../app.module.css';

interface EventCard {
  _id: string; title: string; category: string; startAt: string; endAt: string; venue: string; coverImage: string; status: string;
  goingCount: number; capacity: number; mine: { status: string } | null; clubInfo: { name: string; slug: string } | null;
}

export default function EventsPage() {
  return <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}><Events /></Suspense>;
}

function Events() {
  const router = useRouter();
  const params = useSearchParams();
  const [scope, setScope] = useState<'upcoming' | 'mine' | 'past'>('upcoming');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const { data } = useApiQuery<{ events: EventCard[] }>('/api/events', { scope, category: category || undefined });

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Events</h1>
          <p className={styles.pageSubtitle}>Talks, fests, workshops, and club nights. RSVP once and it lands in your calendar.</p>
        </div>
        <div className="row gap-2 wrap">
          <CalendarFeedButton label="Calendar" />
          <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>Host an event</Button>
        </div>
      </div>
      <div className="row gap-3 wrap">
        <Segmented ariaLabel="Which events" value={scope} onChange={setScope} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'mine', label: 'Going & hosting' }, { value: 'past', label: 'Past' }]} />
        <Select aria-label="Type" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ value: '', label: 'All types' }, ...Object.entries(EVENT_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))]} />
      </div>
      {!data ? (
        <div className={cs.grid}>{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 260, borderRadius: 20 }} />)}</div>
      ) : data.events.length === 0 ? (
        <EmptyState art={<PartyPopper size={36} strokeWidth={1.4} />} title={scope === 'mine' ? 'Nothing on your calendar' : 'No events yet'} body="Host one — a study jam, a fireside chat, a Sunday cricket match." action={<Button onClick={() => setCreating(true)}>Host an event</Button>} />
      ) : (
        <div className={cs.grid}>
          {data.events.map((e) => {
            const start = new Date(e.startAt);
            return (
              <Link key={e._id} href={`/events/${e._id}`} className={cs.card}>
                <div className={cs.cover}>
                  {e.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.coverImage} alt="" loading="lazy" />
                  ) : (
                    <CalendarDays size={36} strokeWidth={1.3} className="dim" />
                  )}
                  <div className={cs.dateBadge}><span>{start.toLocaleDateString('en-IN', { month: 'short' })}</span><strong>{start.getDate()}</strong></div>
                </div>
                <div className={cs.cardBody}>
                  <div className="row gap-2 wrap">
                    <Chip>{EVENT_CATEGORY_LABEL[e.category] ?? e.category}</Chip>
                    {e.status === 'cancelled' && <Chip tone="rose">Cancelled</Chip>}
                    {e.mine?.status === 'going' && <Chip tone="teal">Going</Chip>}
                    {e.mine?.status === 'waitlist' && <Chip tone="amber">Waitlist</Chip>}
                  </div>
                  <span className={cs.cardTitle}>{e.title}</span>
                  <div className={cs.meta}>
                    <span><CalendarDays size={12} /> {start.toLocaleDateString('en-IN', { weekday: 'short' })} {formatTime(e.startAt)}</span>
                    {e.venue && <span><MapPin size={12} /> {e.venue}</span>}
                    <span><Users size={12} /> {e.goingCount}{e.capacity ? `/${e.capacity}` : ''} going</span>
                  </div>
                  {e.clubInfo && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>by {e.clubInfo.name}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <EventDialog onClose={() => setCreating(false)} onCreated={(id) => router.push(`/events/${id}`)} />}
    </div>
  );
}
