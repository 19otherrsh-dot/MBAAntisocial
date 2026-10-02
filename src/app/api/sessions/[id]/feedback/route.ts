import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { feedbackSchema, objectId, MENTOR_RUBRIC_KEYS, MENTEE_RUBRIC_KEYS } from '@/lib/validation';
import { award } from '@/lib/gamification';
import { notify } from '@/lib/notifications';
import InterviewSlot from '@/models/InterviewSlot';
import User from '@/models/User';

/**
 * Submits rubric feedback for a completed session.
 *
 * The original endpoint took a `slotId` and a client-supplied `feedbackType`
 * and wrote it with no checks whatsoever — any signed-in user could forge
 * feedback on any session, in either direction, at any time. Three things are
 * enforced here instead:
 *
 *  1. The caller must be a participant in this specific slot.
 *  2. Direction is derived from that relationship, never from the request.
 *  3. The session must have actually completed, and feedback is write-once.
 */
export const POST = route({ body: feedbackSchema, rateLimit: 'write' }, async ({ actor, body, params }) => {
  const slotId = objectId.parse(params.id);

  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound('That session no longer exists.');

  const isMentor = slot.mentor.toString() === actor.id;
  const isMentee = slot.bookedBy?.toString() === actor.id;
  if (!isMentor && !isMentee) {
    throw ApiError.forbidden('You were not part of that session.');
  }

  if (slot.status !== 'completed') {
    throw ApiError.conflict('Feedback opens once the session is marked complete.');
  }

  const field = isMentor ? 'mentorFeedback' : 'menteeFeedback';
  if (slot[field]) {
    throw ApiError.conflict('You have already left feedback for this session.');
  }

  // Both rubrics are answered in full or not at all — a partial rubric is not
  // a rating, and a half-filled average is worse than none.
  const expectedKeys = isMentor ? MENTOR_RUBRIC_KEYS : MENTEE_RUBRIC_KEYS;
  const missing = expectedKeys.filter((key) => typeof body.scores[key] !== 'number');
  if (missing.length > 0) {
    throw ApiError.unprocessable('Rate every criterion before submitting.', { missing });
  }

  // Ignore any extra keys a client might send, so only known criteria are stored.
  const scores = new Map(expectedKeys.map((key) => [key, body.scores[key]]));
  const mean = expectedKeys.reduce((sum, key) => sum + body.scores[key], 0) / expectedKeys.length;

  slot.set(field, { scores, comments: body.comments, submittedAt: new Date() });
  await slot.save();

  /*
   * The rating lands on the person being rated, not the author: a mentor's
   * feedback scores the mentee, so it updates the mentee's `menteeRating`.
   * Stored as a running sum and count so a profile never has to aggregate.
   */
  const subjectId = isMentor ? slot.bookedBy : slot.mentor;
  const subjectField = isMentor ? 'menteeRating' : 'mentorRating';

  if (subjectId) {
    await User.updateOne(
      { _id: subjectId },
      { $inc: { [`${subjectField}.sum`]: mean, [`${subjectField}.count`]: 1 } }
    );

    await notify({
      user: subjectId,
      kind: 'feedback_received',
      title: 'You have new session feedback',
      body: body.comments.slice(0, 160),
      href: isMentor ? '/sessions?view=bookings' : '/sessions?view=hosting',
      entityType: 'slot',
      entity: slotId,
      actor: actor.id,
    });
  }

  // Karma for writing it, keyed on the slot so it pays out once.
  await award(actor.id, 'feedback_given', { entityType: 'slot', entity: slotId });

  return ok({
    feedback: { scores: Object.fromEntries(scores), comments: body.comments },
    direction: isMentor ? 'mentor_to_mentee' : 'mentee_to_mentor',
  });
});
