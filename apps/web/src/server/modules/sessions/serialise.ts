import type { IInterviewSlot } from '@/models/InterviewSlot';

/**
 * A slot as it comes back from `.lean()`, with the reference fields widened:
 * `populate()` swaps them for full documents at runtime without changing the
 * static type, so both shapes have to be accepted here.
 */
type PopulatedSlot = Omit<
  IInterviewSlot,
  'mentor' | 'bookedBy' | 'mentorFeedback' | 'menteeFeedback' | 'template'
> & {
  _id: unknown;
  mentor: unknown;
  bookedBy?: unknown;
  template?: unknown;
  mentorFeedback?: unknown;
  menteeFeedback?: unknown;
};

/**
 * Shapes a slot for the client and, critically, decides who may read which
 * feedback. Both parties see feedback written about them and feedback they
 * wrote; nobody else sees either.
 */
export function serialiseSlot(slot: PopulatedSlot, viewerId: string) {
  const mentorId = extractId(slot.mentor);
  const menteeId = extractId(slot.bookedBy);
  const isMentor = mentorId === viewerId;
  const isMentee = menteeId === viewerId;
  const isParticipant = isMentor || isMentee;

  return {
    ...slot,
    _id: String(slot._id),
    viewerRole: isMentor ? 'mentor' : isMentee ? 'mentee' : 'observer',
    // The junior's private context for the session is for the mentor only.
    bookingNote: isParticipant ? slot.bookingNote : '',
    // Links are for the two people in the session; the host link is the mentor's alone.
    meetingLink: isParticipant ? slot.meetingLink : '',
    meetingHostUrl: isMentor ? slot.meetingHostUrl : '',
    crossCampus: Boolean(slot.menteeCampus && slot.menteeCampus !== slot.campus),
    mentorFeedback: isParticipant ? normaliseFeedback(slot.mentorFeedback) : undefined,
    menteeFeedback: isParticipant ? normaliseFeedback(slot.menteeFeedback) : undefined,
  };
}

function extractId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'object' && '_id' in value) return String((value as { _id: unknown })._id);
  return String(value);
}

/** Mongoose Maps do not survive `JSON.stringify`; convert to a plain object. */
function normaliseFeedback(feedback: unknown) {
  if (!feedback || typeof feedback !== 'object') return undefined;
  const record = feedback as { scores?: unknown; comments?: string; submittedAt?: Date };
  return {
    scores:
      record.scores instanceof Map
        ? Object.fromEntries(record.scores)
        : (record.scores as Record<string, number> | undefined) ?? {},
    comments: record.comments ?? '',
    submittedAt: record.submittedAt,
  };
}
