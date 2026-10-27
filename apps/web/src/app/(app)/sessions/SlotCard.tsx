'use client';

import {
  Video,
  MessageSquareQuote,
  Star,
  CalendarX2,
  CalendarCheck2,
  UserX,
  Link2Off,
  Clock,
  Calendar,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Avatar, Chip } from '@/components/ui/Display';
import { useNow } from '@/lib/client/hooks';
import { downloadIcs } from '@/lib/calendar';
import {
  cn,
  formatDayLabel,
  formatTimeRange,
  formatDuration,
  hostnameOf,
} from '@/lib/utils';
import {
  SESSION_TYPE_META,
  MENTOR_RUBRIC,
  MENTEE_RUBRIC,
  CANCELLATION_NOTICE_HOURS,
  type SessionType,
  type SlotStatus,
} from '@/lib/constants';
import styles from '../app.module.css';

export interface Person {
  _id: string;
  name: string;
  image?: string;
  year?: 1 | 2;
  mentorProfile?: { headline?: string; companies?: string[] };
  mentorRating?: { sum: number; count: number };
  specializations?: string[];
}

export interface Feedback {
  scores: Record<string, number>;
  comments: string;
  submittedAt?: string;
}

export interface Slot {
  _id: string;
  startAt: string;
  endAt: string;
  sessionType: SessionType;
  status: SlotStatus;
  notes: string;
  meetingLink: string;
  bookingNote: string;
  mentor: Person;
  bookedBy?: Person;
  viewerRole: 'mentor' | 'mentee' | 'observer';
  mentorFeedback?: Feedback;
  menteeFeedback?: Feedback;
  wasLateCancellation?: boolean;
}

interface SlotCardProps {
  slot: Slot;
  view: 'open' | 'bookings' | 'hosting';
  busy: boolean;
  onBook: (slot: Slot) => void;
  onCancel: (slot: Slot) => void;
  onComplete: (slot: Slot, noShow: boolean) => void;
  onReschedule: (slot: Slot) => void;
  onFeedback: (slot: Slot) => void;
  onWithdraw: (slot: Slot) => void;
}

function averageOf(summary?: { sum: number; count: number }): string | null {
  if (!summary || summary.count === 0) return null;
  return (summary.sum / summary.count).toFixed(1);
}

export default function SlotCard({
  slot,
  view,
  busy,
  onBook,
  onCancel,
  onComplete,
  onReschedule,
  onFeedback,
  onWithdraw,
}: SlotCardProps) {
  const now = useNow();
  const meta = SESSION_TYPE_META[slot.sessionType];
  const start = new Date(slot.startAt);
  const isPast = start.getTime() < now;

  const isMentor = slot.viewerRole === 'mentor';
  const counterpart = isMentor ? slot.bookedBy : slot.mentor;

  // Which rubric the viewer owes, and whether they have already filed it.
  const myFeedback = isMentor ? slot.mentorFeedback : slot.menteeFeedback;
  const theirFeedback = isMentor ? slot.menteeFeedback : slot.mentorFeedback;
  const theirRubric = isMentor ? MENTEE_RUBRIC : MENTOR_RUBRIC;

  const rating = averageOf(slot.mentor?.mentorRating);

  const hoursUntil = (start.getTime() - now) / 3_600_000;
  const insideNotice = slot.status === 'booked' && hoursUntil < CANCELLATION_NOTICE_HOURS && hoursUntil > 0;

  return (
    <article className={styles.slotCard}>
      <div className={styles.slotWhen}>
        <span className={styles.slotDay}>
          {start.toLocaleDateString('en-IN', { month: 'short' })}
        </span>
        <span className={styles.slotDate}>{start.getDate()}</span>
        <span className={styles.slotTime}>{formatDayLabel(start)}</span>
      </div>

      <div className={styles.slotMain}>
        <div className={styles.slotTop}>
          <Chip tone={meta.tone}>{meta.label}</Chip>
          <Chip outline>{formatTimeRange(slot.startAt, slot.endAt)}</Chip>
          <Chip outline>{formatDuration(slot.startAt, slot.endAt)}</Chip>
          {slot.status === 'completed' && <Chip tone="teal">Completed</Chip>}
          {slot.status === 'cancelled' && <Chip tone="rose">Cancelled</Chip>}
          {slot.status === 'no_show' && <Chip tone="rose">No-show</Chip>}
          {slot.status === 'booked' && view !== 'open' && <Chip tone="blue">Confirmed</Chip>}
        </div>

        {counterpart ? (
          <div className={styles.slotPerson}>
            <Avatar name={counterpart.name} image={counterpart.image} seed={counterpart._id} size={32} />
            <div style={{ minWidth: 0 }}>
              <div className={styles.slotName}>{counterpart.name}</div>
              <div className={styles.slotRole}>
                {counterpart.year === 2 ? 'Second year' : 'First year'}
                {!isMentor && rating && ` · ${rating}/5 from ${slot.mentor.mentorRating?.count} sessions`}
                {!isMentor && slot.mentor?.mentorProfile?.headline
                  ? ` · ${slot.mentor.mentorProfile.headline}`
                  : ''}
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.slotPerson}>
            <Avatar name={slot.mentor.name} image={slot.mentor.image} seed={slot.mentor._id} size={32} />
            <div style={{ minWidth: 0 }}>
              <div className={styles.slotName}>{slot.mentor.name}</div>
              <div className={styles.slotRole}>
                {rating
                  ? `${rating}/5 across ${slot.mentor.mentorRating?.count} sessions`
                  : 'No ratings yet'}
                {slot.mentor.mentorProfile?.headline ? ` · ${slot.mentor.mentorProfile.headline}` : ''}
              </div>
            </div>
          </div>
        )}

        {slot.notes && <p className={styles.slotNote}>{slot.notes}</p>}

        {/* The junior's context is shown to the mentor only; the API withholds
            it from anyone who is not a participant. */}
        {isMentor && slot.bookingNote && (
          <p className={styles.slotNote}>
            <strong>They asked for: </strong>
            {slot.bookingNote}
          </p>
        )}

        {slot.status === 'booked' && (
          <div className={styles.slotStats}>
            {slot.meetingLink ? (
              <a
                href={slot.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.slotStat}
                style={{ color: 'var(--accent-text)', fontWeight: 550 }}
              >
                <Video size={13} />
                Join on {hostnameOf(slot.meetingLink)}
              </a>
            ) : (
              <span className={styles.slotStat} style={{ color: 'var(--amber-text)' }}>
                <Link2Off size={13} />
                {isMentor ? 'Add a meeting link before this starts' : 'Host has not added a link yet'}
              </span>
            )}
            {insideNotice && (
              <span className={styles.slotStat} style={{ color: 'var(--amber-text)' }}>
                <Clock size={13} />
                Inside the {CANCELLATION_NOTICE_HOURS}h notice window
              </span>
            )}
          </div>
        )}

        {/* Feedback received: rendered whole, because the rubric is the point. */}
        {theirFeedback && (
          <div className={styles.feedbackBlock}>
            <span className="eyebrow">
              {isMentor ? 'How they rated the session' : 'What your mentor said'}
            </span>
            <div className={styles.feedbackScores}>
              {theirRubric.map((criterion) => (
                <span key={criterion.key} className={styles.feedbackScore}>
                  {criterion.label}
                  <span className={styles.feedbackScoreValue}>
                    {theirFeedback.scores[criterion.key] ?? '—'}/5
                  </span>
                </span>
              ))}
            </div>
            <p className={styles.feedbackComment}>{theirFeedback.comments}</p>
          </div>
        )}

        <div className={styles.slotActions}>
          {view === 'open' && slot.status === 'available' && (
            <Button size="sm" onClick={() => onBook(slot)} loading={busy}>
              Book this slot
            </Button>
          )}

          {view === 'hosting' && slot.status === 'available' && (
            <>
              <Button size="sm" variant="secondary" onClick={() => onReschedule(slot)}>
                Move
              </Button>
              <Button size="sm" variant="dangerGhost" onClick={() => onWithdraw(slot)} loading={busy}>
                Withdraw
              </Button>
            </>
          )}

          {slot.status === 'booked' && (
            <>
              {isMentor && isPast && (
                <>
                  <Button
                    size="sm"
                    icon={<CalendarCheck2 size={15} />}
                    onClick={() => onComplete(slot, false)}
                    loading={busy}
                  >
                    Mark complete
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<UserX size={15} />}
                    onClick={() => onComplete(slot, true)}
                  >
                    They did not show
                  </Button>
                </>
              )}
              {isMentor && !isPast && (
                <Button size="sm" variant="secondary" onClick={() => onReschedule(slot)}>
                  Move
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                icon={<Calendar size={15} />}
                onClick={() => {
                  downloadIcs({
                    title: `MBAAntisocial: ${SESSION_TYPE_META[slot.sessionType].label} with ${counterpart?.name || slot.mentor.name}`,
                    description: slot.notes || 'Mock session.',
                    startTime: new Date(slot.startAt),
                    endTime: new Date(slot.endAt),
                    location: slot.meetingLink || undefined,
                  }, `session_${slot._id}.ics`);
                }}
              >
                Add to Calendar
              </Button>
              <Button
                size="sm"
                variant="dangerGhost"
                icon={<CalendarX2 size={15} />}
                onClick={() => onCancel(slot)}
              >
                Cancel
              </Button>
            </>
          )}

          {slot.status === 'completed' &&
            (myFeedback ? (
              <span className={cn(styles.slotStat, 'dim')}>
                <Star size={13} />
                Feedback submitted
              </span>
            ) : (
              <Button
                size="sm"
                variant="soft"
                icon={<MessageSquareQuote size={15} />}
                onClick={() => onFeedback(slot)}
              >
                Leave feedback
              </Button>
            ))}
        </div>
      </div>
    </article>
  );
}
