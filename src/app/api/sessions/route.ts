import { route, ok, created, paginate, pageMeta } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createSlotSchema, slotQuerySchema } from '@/lib/validation';
import { assertNoMentorConflict } from '@/lib/scheduling';
import InterviewSlot from '@/models/InterviewSlot';
import User from '@/models/User';
import type { QueryFilter } from 'mongoose';
import type { IInterviewSlot } from '@/models/InterviewSlot';

const MENTOR_FIELDS = 'name image year specializations mentorProfile karma mentorRating badges';
const MENTEE_FIELDS = 'name image year batch';

/**
 * Lists sessions in one of three views.
 *
 * Every view is scoped to the caller's campus. The previous implementation
 * filtered only on status and date, so a student at one school could see and
 * book slots published at another — the opposite of the campus-native model in
 * §6.1, and a privacy leak besides.
 */
export const GET = route({ query: slotQuerySchema }, async ({ actor, query }) => {
  const { skip, limit } = paginate(query);

  const filter: QueryFilter<IInterviewSlot> = { campus: actor.campus };

  if (query.view === 'open') {
    filter.status = 'available';
    filter.startAt = { $gte: new Date() };
    filter.mentor = { $ne: actor.id };
  } else if (query.view === 'bookings') {
    filter.bookedBy = actor.id;
  } else {
    filter.mentor = actor.id;
  }

  if (query.sessionType) filter.sessionType = query.sessionType;

  // Open slots read soonest-first; personal history reads newest-first.
  const sort: Record<string, 1 | -1> = query.view === 'open' ? { startAt: 1 } : { startAt: -1 };

  const [slots, total] = await Promise.all([
    InterviewSlot.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('mentor', MENTOR_FIELDS)
      .populate('bookedBy', MENTEE_FIELDS)
      .lean(),
    InterviewSlot.countDocuments(filter),
  ]);

  return ok({
    slots: slots.map((slot) => serialiseSlot(slot, actor.id)),
    pagination: pageMeta(query, total),
  });
});

/** Publishes a new availability slot. */
export const POST = route(
  { body: createSlotSchema, requireMentor: true, rateLimit: 'write' },
  async ({ actor, body }) => {
    const mentor = await User.findById(actor.id).select('mentorProfile').lean();
    if (!mentor) throw ApiError.notFound('Your account could not be loaded.');

    if (!mentor.mentorProfile?.acceptingBookings) {
      throw ApiError.unprocessable(
        'Turn on "accepting bookings" in your profile before publishing slots.'
      );
    }

    const offers = mentor.mentorProfile.offers ?? [];
    if (offers.length > 0 && !offers.includes(body.sessionType)) {
      throw ApiError.unprocessable('You have not listed that session type on your profile.');
    }

    await assertNoMentorConflict(actor.id, body.startAt, body.endAt);

    const slot = await InterviewSlot.create({
      mentor: actor.id,
      campus: actor.campus,
      startAt: body.startAt,
      endAt: body.endAt,
      sessionType: body.sessionType,
      notes: body.notes,
      meetingLink: body.meetingLink,
      status: 'available',
    });

    const populated = await InterviewSlot.findById(slot._id)
      .populate('mentor', MENTOR_FIELDS)
      .lean();

    return created({ slot: serialiseSlot(populated!, actor.id) });
  }
);

/**
 * A slot as it comes back from `.lean()`, with the reference fields widened:
 * `populate()` swaps them for full documents at runtime without changing the
 * static type, so both shapes have to be accepted here.
 */
type PopulatedSlot = Omit<
  IInterviewSlot,
  'mentor' | 'bookedBy' | 'mentorFeedback' | 'menteeFeedback'
> & {
  _id: unknown;
  mentor: unknown;
  bookedBy?: unknown;
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
