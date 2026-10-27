'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, CalendarPlus, Check, Link2, MapPin, Megaphone, Star, Ticket, Users, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Textarea } from '@/components/ui/Field';
import { Avatar, Banner, Chip, EmptyState } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery, useNow } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { downloadIcs } from '@/lib/calendar';
import { formatDateTime, formatTime } from '@/lib/utils';
import RichText from '@/components/RichText';
import { EVENT_CATEGORY_LABEL } from '@/components/campus/EventDialog';
import cs from '@/components/campus/campus.module.css';
import styles from '../../app.module.css';

interface EventDetail {
  _id: string; title: string; description: string; category: string; host: { _id: string; name: string }; startAt: string; endAt: string; venue: string; onlineUrl: string;
  capacity: number; coverImage: string; status: string; goingCount: number; interestedCount: number; waitlistCount: number;
  attendees: Array<{ _id: string; name: string; image: string }>; mine: { status: 'going' | 'interested' | 'waitlist'; checkedIn: boolean } | null;
  canManage: boolean; checkInCode?: string; checkedInCount?: number; clubInfo: { name: string; slug: string } | null;
}

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const now = useNow();
  const { confirm, dialog } = useConfirm();
  const { data, error, refetch } = useApiQuery<{ event: EventDetail; guestList?: Array<{ _id: string; name: string; status: string; checkedIn: boolean }> }>(`/api/events/${id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [announcing, setAnnouncing] = useState(false);

  if (error) return <EmptyState title="Event not found" body={error} action={<Link href="/events"><Button>All events</Button></Link>} />;
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;
  const e = data.event;
  const start = new Date(e.startAt).getTime();
  const end = new Date(e.endAt).getTime();
  const checkInOpen = now >= start - 30 * 60_000 && now <= end + 60 * 60_000;
  const over = now > end;

  const act = async (key: string, body: Record<string, unknown>, success?: string) => {
    setBusy(key);
    try {
      const result = await api.post<{ status?: string }>(`/api/events/${id}`, body);
      if (result.status === 'waitlist') toast.info('You’re on the waitlist', 'We’ll tell you the moment a spot opens.');
      else if (success) toast.success(success);
      refetch();
      return true;
    } catch (caught) {
      toast.error('That did not work', errorMessage(caught));
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack gap-5" style={{ maxWidth: 860 }}>
      <Link href="/events" className="row gap-1 dim" style={{ fontSize: 'var(--t-sm)' }}><ArrowLeft size={14} /> Events</Link>
      {e.coverImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.coverImage} alt="" style={{ width: '100%', aspectRatio: '21 / 9', objectFit: 'cover', borderRadius: 'var(--r-xl)' }} />
      )}
      <div className="stack gap-2">
        <div className="row gap-2 wrap">
          <Chip>{EVENT_CATEGORY_LABEL[e.category] ?? e.category}</Chip>
          {e.clubInfo && <Link href={`/clubs/${e.clubInfo.slug}`}><Chip tone="violet">{e.clubInfo.name}</Chip></Link>}
          {e.status === 'cancelled' && <Chip tone="rose">Cancelled</Chip>}
        </div>
        <h1 className={styles.pageTitle}>{e.title}</h1>
        <div className={cs.meta} style={{ fontSize: 'var(--t-sm)' }}>
          <span><CalendarDays size={14} /> {formatDateTime(e.startAt)} – {formatTime(e.endAt)}</span>
          {e.venue && <span><MapPin size={14} /> {e.venue}</span>}
          <span><Users size={14} /> {e.goingCount}{e.capacity ? ` of ${e.capacity}` : ''} going{e.interestedCount ? ` · ${e.interestedCount} interested` : ''}{e.waitlistCount ? ` · ${e.waitlistCount} waiting` : ''}</span>
          <span>Hosted by <Link href={`/u/${e.host._id}`}>{e.host.name}</Link></span>
        </div>
      </div>

      {e.status !== 'cancelled' && !over && (
        <div className="row gap-2 wrap">
          {e.mine?.status === 'going' ? (
            <Button variant="secondary" icon={<Check size={15} />} loading={busy === 'out'} onClick={() => act('out', { action: 'rsvp', status: null })}>Going — tap to cancel</Button>
          ) : e.mine?.status === 'waitlist' ? (
            <Button variant="secondary" loading={busy === 'out'} onClick={() => act('out', { action: 'rsvp', status: null })}>On the waitlist — leave</Button>
          ) : (
            <Button size="lg" icon={<Ticket size={16} />} loading={busy === 'going'} onClick={() => act('going', { action: 'rsvp', status: 'going' }, 'You’re going!')}>
              {e.capacity && e.goingCount >= e.capacity ? 'Join the waitlist' : 'I’m going'}
            </Button>
          )}
          {!e.mine && <Button variant="ghost" icon={<Star size={15} />} loading={busy === 'int'} onClick={() => act('int', { action: 'rsvp', status: 'interested' })}>Interested</Button>}
          {e.mine?.status === 'interested' && <Button variant="ghost" onClick={() => act('out', { action: 'rsvp', status: null })}>Not interested</Button>}
          <Button variant="ghost" icon={<CalendarPlus size={15} />} onClick={() => downloadIcs({ title: e.title, description: `${e.description}\n\n${window.location.href}`, location: e.venue, startTime: new Date(e.startAt), endTime: new Date(e.endAt) }, 'event.ics')}>Add to calendar</Button>
          {e.onlineUrl && e.onlineUrl !== 'on-rsvp' && <a href={e.onlineUrl} target="_blank" rel="noopener noreferrer"><Button variant="ghost" icon={<Link2 size={15} />}>Join online</Button></a>}
          {e.onlineUrl === 'on-rsvp' && <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>The online link appears once you RSVP.</span>}
        </div>
      )}

      {checkInOpen && e.status !== 'cancelled' && !e.mine?.checkedIn && !e.canManage && (
        <Banner variant="info" title="Here already? Check in">
          <form className="row gap-2" style={{ marginTop: 8 }} onSubmit={async (ev) => { ev.preventDefault(); if (await act('checkin', { action: 'check_in', code }, 'Checked in — enjoy!')) setCode(''); }}>
            <Input aria-label="Check-in code" placeholder="4-digit code" inputMode="numeric" maxLength={4} value={code} onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ''))} style={{ width: 130, letterSpacing: '0.2em' }} />
            <Button type="submit" size="sm" loading={busy === 'checkin'} disabled={code.length !== 4}>Check in</Button>
          </form>
        </Banner>
      )}
      {e.mine?.checkedIn && <Banner variant="success" title="You checked in">Thanks for showing up.</Banner>}

      {e.description && <div className={cs.panel}><RichText text={e.description} /></div>}

      {e.attendees.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}><Users size={15} /> Who’s going</div>
          <div className="row gap-1 wrap">
            {e.attendees.map((a) => <Link key={a._id} href={`/u/${a._id}`} title={a.name}><Avatar name={a.name} image={a.image} seed={a._id} size={32} /></Link>)}
            {e.goingCount > e.attendees.length && <span className="dim" style={{ fontSize: 'var(--t-sm)', marginLeft: 6 }}>+{e.goingCount - e.attendees.length} more</span>}
          </div>
        </section>
      )}

      {e.canManage && (
        <section className={cs.panel}>
          <div className={styles.sectionHead}>Organiser tools</div>
          <div className="row gap-5 wrap">
            <div className="stack"><span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Check-in code — show it at the door</span><span style={{ fontSize: 30, fontWeight: 750, letterSpacing: '0.25em', fontFamily: 'var(--font-mono)' }}>{e.checkInCode}</span></div>
            <div className="stack"><span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Checked in</span><span style={{ fontSize: 30, fontWeight: 750 }}>{e.checkedInCount}</span></div>
          </div>
          <div className="row gap-2 wrap">
            <Button size="sm" variant="secondary" icon={<Megaphone size={14} />} onClick={() => setAnnouncing(true)}>Message attendees</Button>
            {e.status !== 'cancelled' && !over && (
              <Button size="sm" variant="ghost" icon={<XCircle size={14} />} onClick={async () => { if (await confirm({ title: 'Cancel this event?', body: 'Everyone who RSVP’d is told.', confirmLabel: 'Cancel event', destructive: true })) void act('cancel', { action: 'cancel' }, 'Event cancelled'); }}>Cancel event</Button>
            )}
          </div>
          {data.guestList && data.guestList.length > 0 && (
            <div>
              {data.guestList.map((g) => (
                <div key={g._id} className={cs.rowItem}>
                  <span style={{ flex: 1 }}>{g.name}</span>
                  <Chip tone={g.status === 'going' ? 'teal' : g.status === 'waitlist' ? 'amber' : 'slate'}>{g.status}</Chip>
                  {g.checkedIn && <Check size={14} style={{ color: 'var(--success)' }} aria-label="Checked in" />}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {announcing && <AnnounceDialog onClose={() => setAnnouncing(false)} onSend={async (message) => { if (await act('announce', { action: 'announce', message }, 'Sent to everyone who RSVP’d')) setAnnouncing(false); }} />}
      {dialog}
    </div>
  );
}

function AnnounceDialog({ onClose, onSend }: { onClose: () => void; onSend: (message: string) => void }) {
  const [message, setMessage] = useState('');
  return (
    <Dialog open onClose={onClose} title="Message attendees" description="Sent as a notification to everyone who RSVP’d."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => onSend(message)} disabled={message.trim().length < 3}>Send</Button></>}>
      <Textarea label="Message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Doors open at 5:45. Bring your ID card." />
    </Dialog>
  );
}
