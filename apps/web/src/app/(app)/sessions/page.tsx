'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarPlus, CalendarClock, Inbox } from 'lucide-react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Banner, EmptyState, Segmented, Chip } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/useConfirm';
import { useApiQuery, useAction } from '@/lib/client/hooks';
import { useMe } from '@/lib/client/me';
import { api } from '@/lib/client/api';
import SlotCard, { type Slot } from './SlotCard';
import FeedbackDialog from './FeedbackDialog';
import {
  SESSION_TYPES,
  SESSION_TYPE_META,
  CANCELLATION_NOTICE_HOURS,
  MAX_ACTIVE_BOOKINGS_PER_MENTEE,
  type SessionType,
} from '@/lib/constants';
import { toDateTimeLocalValue, formatDateTime } from '@/lib/utils';
import styles from '../app.module.css';

type View = 'open' | 'bookings' | 'hosting';

const VIEWS: Array<{ value: View; label: string }> = [
  { value: 'open', label: 'Open slots' },
  { value: 'bookings', label: 'My bookings' },
  { value: 'hosting', label: 'Hosting' },
];

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 300 }} />}>
      <SessionsView />
    </Suspense>
  );
}

function SessionsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { me } = useMe();

  const viewParam = searchParams.get('view');
  const view: View =
    viewParam === 'bookings' || viewParam === 'hosting' ? viewParam : 'open';

  const [typeFilter, setTypeFilter] = useState<SessionType | ''>('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<Slot | null>(null);
  const [feedbackSlot, setFeedbackSlot] = useState<Slot | null>(null);
  const [rescheduleSlot, setRescheduleSlot] = useState<Slot | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useMemo(
    () => ({ view, ...(typeFilter ? { sessionType: typeFilter } : {}) }),
    [view, typeFilter]
  );

  const { data, loading, error, refetch } = useApiQuery<{ slots: Slot[] }>('/api/sessions', query);
  const slots = data?.slots ?? [];

  const setView = (next: View) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', next);
    router.replace(`/sessions?${params.toString()}`, { scroll: false });
  };

  const act = useCallback(
    async (slotId: string, body: Record<string, unknown>, successMessage: string) => {
      setBusyId(slotId);
      try {
        await api.patch(`/api/sessions/${slotId}`, body);
        toast.success(successMessage);
        refetch();
      } catch (caught) {
        toast.error('That did not go through', caught instanceof Error ? caught.message : undefined);
      } finally {
        setBusyId(null);
      }
    },
    [refetch, toast]
  );

  const feedback = useAction(async (slotId: string, scores: Record<string, number>, comments: string) => {
    await api.post(`/api/sessions/${slotId}/feedback`, { scores, comments });
    toast.success('Feedback sent', 'It is on their profile now.');
    setFeedbackSlot(null);
    refetch();
  });

  const activeBookings = view === 'bookings' ? slots.filter((s) => s.status === 'booked').length : 0;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h2 className={styles.pageTitle}>Mock prep</h2>
          <p className={styles.pageSubtitle}>
            {view === 'open'
              ? `Open slots at ${me?.campus ?? 'your campus'}. Book up to ${MAX_ACTIVE_BOOKINGS_PER_MENTEE} at a time.`
              : view === 'bookings'
                ? 'Sessions you have booked, and the feedback from them.'
                : 'Slots you have published and the people who took them.'}
          </p>
        </div>

        {me?.canMentor && (
          <Button icon={<CalendarPlus size={16} />} onClick={() => setPublishOpen(true)}>
            Publish a slot
          </Button>
        )}
      </div>

      <div className={styles.toolbar}>
        <Segmented options={VIEWS} value={view} onChange={setView} ariaLabel="Session view" />

        <div className={styles.toolbarPush}>
          <Select
            aria-label="Filter by session type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as SessionType | '')}
            options={[
              { value: '', label: 'All types' },
              ...SESSION_TYPES.map((type) => ({
                value: type,
                label: SESSION_TYPE_META[type].label,
              })),
            ]}
          />
        </div>
      </div>

      {view === 'bookings' && activeBookings >= MAX_ACTIVE_BOOKINGS_PER_MENTEE && (
        <Banner variant="info" icon={<Inbox size={16} />} title="You are at your booking limit">
          {MAX_ACTIVE_BOOKINGS_PER_MENTEE} live sessions is the cap. It exists so seniors are not
          flooded — finish one and the next slot opens up.
        </Banner>
      )}

      {me?.canMentor && view === 'hosting' && !me.mentorProfile.acceptingBookings && (
        <Banner variant="warning" title="Hosting is switched off">
          Slots you publish will not be bookable until you turn on “accepting bookings”.{' '}
          <Link href="/profile" style={{ textDecoration: 'underline' }}>
            Set it up
          </Link>
          .
        </Banner>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}

      {loading ? (
        <div className={styles.cardList}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 132 }} />
          ))}
        </div>
      ) : slots.length === 0 ? (
        <EmptyState
          art={<CalendarClock size={40} strokeWidth={1.4} />}
          title={
            view === 'open'
              ? 'No open slots right now'
              : view === 'bookings'
                ? 'You have not booked anything yet'
                : 'You have not published any slots'
          }
          body={
            view === 'open'
              ? 'Seniors publish availability in bursts, usually around placement season. Check back, or ask in the feed.'
              : view === 'bookings'
                ? 'Open slots are on the first tab. Book one — a bad mock now is cheaper than a bad interview later.'
                : 'Publish a window or two. You set the cap, and requests stop there.'
          }
          action={
            view === 'bookings' ? (
              <Button variant="secondary" onClick={() => setView('open')}>
                Browse open slots
              </Button>
            ) : view === 'hosting' && me?.canMentor ? (
              <Button onClick={() => setPublishOpen(true)}>Publish a slot</Button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.cardList}>
          {slots.map((slot) => (
            <SlotCard
              key={slot._id}
              slot={slot}
              view={view}
              busy={busyId === slot._id}
              onBook={setBookingSlot}
              onReschedule={setRescheduleSlot}
              onFeedback={setFeedbackSlot}
              onCancel={async (target) => {
                const hours = (new Date(target.startAt).getTime() - Date.now()) / 3_600_000;
                const late = hours < CANCELLATION_NOTICE_HOURS && hours > 0;

                const confirmed = await confirm({
                  title: 'Cancel this session?',
                  body:
                    target.viewerRole === 'mentor'
                      ? 'The slot is withdrawn and whoever booked it is notified.'
                      : 'The slot goes back into the pool for someone else.',
                  warning: late
                    ? `This is inside the ${CANCELLATION_NOTICE_HOURS}-hour notice window, so it is recorded as a late cancellation.`
                    : undefined,
                  confirmLabel: 'Cancel session',
                  cancelLabel: 'Keep it',
                  destructive: true,
                });
                if (!confirmed) return;

                await act(target._id, { action: 'cancel', reason: '' }, 'Session cancelled');
              }}
              onComplete={async (target, noShow) => {
                if (noShow) {
                  const confirmed = await confirm({
                    title: 'Record a no-show?',
                    body: 'This appears on their profile. Use it when someone simply did not turn up.',
                    confirmLabel: 'Record no-show',
                    destructive: true,
                  });
                  if (!confirmed) return;
                }
                await act(
                  target._id,
                  { action: 'complete', noShow },
                  noShow ? 'Recorded as a no-show' : 'Session closed out'
                );
              }}
              onWithdraw={async (target) => {
                const confirmed = await confirm({
                  title: 'Withdraw this slot?',
                  body: 'Nobody has booked it, so it just disappears from the list.',
                  confirmLabel: 'Withdraw',
                  destructive: true,
                });
                if (!confirmed) return;

                setBusyId(target._id);
                try {
                  await api.delete(`/api/sessions/${target._id}`);
                  toast.success('Slot withdrawn');
                  refetch();
                } catch (caught) {
                  toast.error(
                    'Could not withdraw',
                    caught instanceof Error ? caught.message : undefined
                  );
                } finally {
                  setBusyId(null);
                }
              }}
            />
          ))}
        </div>
      )}

      <PublishDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onDone={() => {
          setPublishOpen(false);
          setView('hosting');
          refetch();
        }}
      />

      <BookDialog
        slot={bookingSlot}
        onClose={() => setBookingSlot(null)}
        onConfirm={async (slot, note) => {
          await act(slot._id, { action: 'book', bookingNote: note }, 'Slot booked');
          setBookingSlot(null);
          setView('bookings');
        }}
        busy={busyId !== null}
      />

      <RescheduleDialog
        slot={rescheduleSlot}
        onClose={() => setRescheduleSlot(null)}
        onConfirm={async (slot, startAt, endAt) => {
          await act(slot._id, { action: 'reschedule', startAt, endAt }, 'Session moved');
          setRescheduleSlot(null);
        }}
        busy={busyId !== null}
      />

      <FeedbackDialog
        slot={feedbackSlot}
        onClose={() => setFeedbackSlot(null)}
        onSubmit={async (slotId, scores, comments) => {
          await feedback.run(slotId, scores, comments);
        }}
        pending={feedback.pending}
        error={feedback.error}
      />

      {confirmDialog}
    </>
  );
}

/* ───────────────────────── Publish ───────────────────────── */

function PublishDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { me } = useMe();

  // Defaults to a sensible next-day evening slot rather than an empty field.
  const defaultStart = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(19, 0, 0, 0);
    return toDateTimeLocalValue(start);
  }, []);

  const [sessionType, setSessionType] = useState<SessionType>('mock_interview');
  const [startAt, setStartAt] = useState(defaultStart);
  const [minutes, setMinutes] = useState(String(SESSION_TYPE_META.mock_interview.defaultMinutes));
  const [notes, setNotes] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const publish = useAction(async () => {
    setFieldErrors({});
    const start = new Date(startAt);
    const end = new Date(start.getTime() + Number(minutes) * 60_000);

    await api.post('/api/sessions', {
      sessionType,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      notes,
      meetingLink,
    });

    toast.success('Slot published', 'Juniors on your campus can book it now.');
    setNotes('');
    onDone();
  });

  const offers = me?.mentorProfile.offers ?? [];
  const allowedTypes = offers.length > 0 ? offers : [...SESSION_TYPES];

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Publish a slot"
      description="One window, one booking. Juniors see it the moment you save."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={publish.pending}>
            Cancel
          </Button>
          <Button onClick={() => publish.run()} loading={publish.pending}>
            Publish
          </Button>
        </>
      }
    >
      {publish.error && <Banner variant="danger">{publish.error}</Banner>}

      <Select
        label="Session type"
        value={sessionType}
        onChange={(event) => {
          const next = event.target.value as SessionType;
          setSessionType(next);
          setMinutes(String(SESSION_TYPE_META[next].defaultMinutes));
        }}
        options={allowedTypes.map((type) => ({
          value: type,
          label: SESSION_TYPE_META[type].label,
        }))}
        hint={SESSION_TYPE_META[sessionType].blurb}
      />

      <Input
        label="Starts at"
        type="datetime-local"
        value={startAt}
        onChange={(event) => setStartAt(event.target.value)}
        error={fieldErrors.startAt}
      />

      <Select
        label="Length"
        value={minutes}
        onChange={(event) => setMinutes(event.target.value)}
        options={[15, 20, 30, 45, 60, 90].map((value) => ({
          value: String(value),
          label: `${value} minutes`,
        }))}
      />

      <Input
        label="Meeting link"
        type="url"
        placeholder="https://meet.google.com/…"
        value={meetingLink}
        onChange={(event) => setMeetingLink(event.target.value)}
        optional
        hint="Your standing room works fine. Without one, whoever books cannot join."
        error={fieldErrors.meetingLink}
      />

      <Textarea
        label="Anything they should bring"
        placeholder="Bring a resume you have actually sent somewhere. I will push on the consulting story."
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        maxLength={500}
        showCount
        rows={3}
        optional
      />
    </Dialog>
  );
}

/* ───────────────────────── Book ───────────────────────── */

function BookDialog({
  slot,
  onClose,
  onConfirm,
  busy,
}: {
  slot: Slot | null;
  onClose: () => void;
  onConfirm: (slot: Slot, note: string) => Promise<void>;
  busy: boolean;
}) {
  const [note, setNote] = useState('');

  if (!slot) return null;

  const meta = SESSION_TYPE_META[slot.sessionType];

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Book ${meta.label.toLowerCase()} with ${slot.mentor.name}`}
      description={formatDateTime(slot.startAt)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await onConfirm(slot, note.trim());
              setNote('');
            }}
            loading={busy}
          >
            Confirm booking
          </Button>
        </>
      }
    >
      <div className="row gap-2 wrap">
        <Chip tone={meta.tone}>{meta.label}</Chip>
        <Chip outline>{formatDateTime(slot.startAt)}</Chip>
      </div>

      {slot.notes && <p className={styles.slotNote}>{slot.notes}</p>}

      <Textarea
        label="What do you want out of this?"
        placeholder="Targeting consulting. Struggle with structuring guesstimates and the 'why MBA' answer."
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        showCount
        rows={4}
        hint="Only your mentor sees this. A specific ask gets you a much better session."
        optional
      />

      <Banner variant="info">
        Cancelling within {CANCELLATION_NOTICE_HOURS} hours is recorded as a late cancellation. Not a
        punishment — just so hosts can see who reliably turns up.
      </Banner>
    </Dialog>
  );
}

/* ───────────────────────── Reschedule ───────────────────────── */

function RescheduleDialog({
  slot,
  onClose,
  onConfirm,
  busy,
}: {
  slot: Slot | null;
  onClose: () => void;
  onConfirm: (slot: Slot, startAt: string, endAt: string) => Promise<void>;
  busy: boolean;
}) {
  const [startAt, setStartAt] = useState('');

  const durationMs = slot
    ? new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime()
    : 0;

  if (!slot) return null;

  const value = startAt || toDateTimeLocalValue(new Date(slot.startAt));

  return (
    <Dialog
      open
      onClose={() => {
        setStartAt('');
        onClose();
      }}
      title="Move this session"
      description={
        slot.bookedBy
          ? `${slot.bookedBy.name} will be notified of the new time.`
          : 'Nobody has booked this yet, so nobody needs telling.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button
            onClick={async () => {
              const start = new Date(value);
              const end = new Date(start.getTime() + durationMs);
              await onConfirm(slot, start.toISOString(), end.toISOString());
              setStartAt('');
            }}
            loading={busy}
          >
            Move session
          </Button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
        Currently {formatDateTime(slot.startAt)}. Length stays the same.
      </p>

      <Input
        label="New start time"
        type="datetime-local"
        value={value}
        onChange={(event) => setStartAt(event.target.value)}
      />
    </Dialog>
  );
}
