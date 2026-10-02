import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { slotActionSchema, objectId } from '@/lib/validation';
import {
  assertBookingCapacity,
  assertNoMentorConflict,
  isInsideNoticeWindow,
  resolveMeetingLink,
} from '@/lib/scheduling';
import { award, evaluateContributionBadges } from '@/lib/gamification';
import { notify } from '@/lib/notifications';
import InterviewSlot from '@/models/InterviewSlot';
import User from '@/models/User';
import { CANCELLATION_NOTICE_HOURS, SESSION_TYPE_META } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';
import { serialiseSlot } from '../route';

const MENTOR_FIELDS = 'name image year specializations mentorProfile karma mentorRating badges';
const MENTEE_FIELDS = 'name image year batch';

/**
 * Acts on a single slot: book, cancel, reschedule, or complete.
 *
 * Every branch re-reads the slot and checks the caller's relationship to it.
 * Holding a slot id is never sufficient authorisation.
 */
export const PATCH = route(
  { body: slotActionSchema, rateLimit: 'booking' },
  async ({ actor, body, params }) => {
    const slotId = objectId.parse(params.id);

    switch (body.action) {
      case 'book':
        return book(actor.id, actor.campus, slotId, body.bookingNote);
      case 'cancel':
        return cancel(actor.id, slotId, body.reason);
      case 'reschedule':
        return reschedule(actor.id, slotId, body.startAt, body.endAt);
      case 'complete':
        return complete(actor.id, slotId, body.noShow);
    }
  }
);

/** Withdraws an unbooked slot. Booked slots must be cancelled, not deleted. */
export const DELETE = route({ rateLimit: 'write' }, async ({ actor, params }) => {
  const slotId = objectId.parse(params.id);

  const deleted = await InterviewSlot.findOneAndDelete({
    _id: slotId,
    mentor: actor.id,
    status: 'available',
  });

  if (!deleted) {
    throw ApiError.conflict('That slot is either booked or not yours to remove.');
  }

  return ok({ deleted: true });
});

// ───────────────────────── Book ─────────────────────────

async function book(userId: string, campus: string, slotId: string, bookingNote: string) {
  const slot = await InterviewSlot.findById(slotId).select('mentor campus startAt status meetingLink');
  if (!slot) throw ApiError.notFound('That slot no longer exists.');

  if (slot.campus !== campus) {
    // Reported as "not found" rather than "forbidden" so slot ids on other
    // campuses cannot be probed for existence.
    throw ApiError.notFound('That slot no longer exists.');
  }
  if (slot.mentor.toString() === userId) {
    throw ApiError.badRequest('You cannot book your own slot.');
  }
  if (slot.startAt.getTime() <= Date.now()) {
    throw ApiError.conflict('That slot has already started.');
  }

  await assertBookingCapacity(userId);

  const { needsLink } = resolveMeetingLink(slot.meetingLink);

  /*
   * Conditional update rather than read-then-write. Two juniors tapping "book"
   * on the same slot at the same moment both pass the checks above; only the
   * one whose update matches `status: 'available'` wins, and the other gets a
   * clean 409 instead of silently overwriting the first booking.
   */
  const booked = await InterviewSlot.findOneAndUpdate(
    { _id: slotId, status: 'available' },
    {
      $set: {
        status: 'booked',
        bookedBy: userId,
        bookedAt: new Date(),
        bookingNote,
      },
    },
    { new: true }
  )
    .populate('mentor', MENTOR_FIELDS)
    .populate('bookedBy', MENTEE_FIELDS)
    .lean();

  if (!booked) throw ApiError.conflict('Someone just took that slot.');

  const mentee = await User.findById(userId).select('name year').lean();

  /*
   * No points are awarded here. The previous implementation paid out on
   * booking, which made book-cancel-rebook an unbounded points loop and
   * rewarded intent rather than attendance. Both parties are credited when the
   * session is marked complete.
   */
  await notify({
    user: slot.mentor,
    kind: 'slot_booked',
    title: `${mentee?.name ?? 'A junior'} booked your ${SESSION_TYPE_META[booked.sessionType].label.toLowerCase()}`,
    body: needsLink
      ? `${formatDateTime(booked.startAt)} — add a meeting link so they can join.`
      : `${formatDateTime(booked.startAt)}${bookingNote ? ` — "${bookingNote.slice(0, 120)}"` : ''}`,
    href: '/sessions?view=hosting',
    entityType: 'slot',
    entity: slotId,
    actor: userId,
  });

  return ok({ slot: serialiseSlot(booked, userId), needsMeetingLink: needsLink });
}

// ───────────────────────── Cancel ─────────────────────────

async function cancel(userId: string, slotId: string, reason: string) {
  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound('That slot no longer exists.');

  const isMentor = slot.mentor.toString() === userId;
  const isMentee = slot.bookedBy?.toString() === userId;
  if (!isMentor && !isMentee) throw ApiError.forbidden('That is not your session.');

  if (slot.status !== 'booked') {
    throw ApiError.conflict('Only a booked session can be cancelled.');
  }

  const late = isInsideNoticeWindow(slot.startAt);

  /*
   * A mentor cancelling retires the slot entirely; a mentee cancelling releases
   * it back to the pool. The old behaviour returned the slot to `available` in
   * both cases, which quietly re-listed a time the mentor had just said they
   * could not make.
   */
  const counterpartyId = isMentor ? slot.bookedBy : slot.mentor;

  if (isMentor) {
    slot.status = 'cancelled';
    slot.cancelledBy = slot.mentor;
  } else {
    slot.status = 'available';
    slot.bookedBy = undefined;
    slot.bookedAt = undefined;
    slot.bookingNote = '';
  }

  slot.cancelledAt = new Date();
  slot.cancellationReason = reason;
  slot.wasLateCancellation = late;
  await slot.save();

  if (late) {
    // Tracked on the profile so a pattern of last-minute drops is visible
    // rather than invisible; nothing is auto-penalised.
    await User.updateOne({ _id: userId }, { $inc: { lateCancellations: 1 } });
  }

  if (counterpartyId) {
    await notify({
      user: counterpartyId,
      kind: 'slot_cancelled',
      title: late ? 'Session cancelled at short notice' : 'Session cancelled',
      body: `${formatDateTime(slot.startAt)}${reason ? ` — "${reason.slice(0, 120)}"` : ''}`,
      href: isMentor ? '/sessions?view=bookings' : '/sessions?view=hosting',
      entityType: 'slot',
      entity: slotId,
      actor: userId,
    });
  }

  return ok({
    slot: { _id: slotId, status: slot.status },
    wasLateCancellation: late,
    noticeHours: CANCELLATION_NOTICE_HOURS,
  });
}

// ───────────────────────── Reschedule ─────────────────────────

async function reschedule(userId: string, slotId: string, startAt: Date, endAt: Date) {
  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound('That slot no longer exists.');

  // Only the mentor owns the time; a mentee who cannot make it cancels instead.
  if (slot.mentor.toString() !== userId) {
    throw ApiError.forbidden('Only the host can move a session.');
  }
  if (slot.status !== 'available' && slot.status !== 'booked') {
    throw ApiError.conflict('That session can no longer be moved.');
  }

  await assertNoMentorConflict(userId, startAt, endAt, slotId);

  const previousStart = slot.startAt;

  slot.rescheduleHistory.push({
    from: previousStart,
    to: startAt,
    by: slot.mentor,
    at: new Date(),
  });
  slot.startAt = startAt;
  slot.endAt = endAt;
  await slot.save();

  if (slot.bookedBy) {
    await notify({
      user: slot.bookedBy,
      kind: 'slot_rescheduled',
      title: 'Your session moved',
      body: `Now ${formatDateTime(startAt)} — it was ${formatDateTime(previousStart)}.`,
      href: '/sessions?view=bookings',
      entityType: 'slot',
      entity: slotId,
      actor: userId,
    });
  }

  return ok({ slot: { _id: slotId, startAt, endAt } });
}

// ───────────────────────── Complete ─────────────────────────

async function complete(userId: string, slotId: string, noShow: boolean) {
  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound('That slot no longer exists.');

  if (slot.mentor.toString() !== userId) {
    throw ApiError.forbidden('Only the host can close out a session.');
  }
  if (slot.status !== 'booked') {
    throw ApiError.conflict('That session is not in a state that can be completed.');
  }
  if (slot.startAt.getTime() > Date.now()) {
    throw ApiError.conflict('That session has not happened yet.');
  }

  const menteeId = slot.bookedBy?.toString();

  if (noShow) {
    slot.status = 'no_show';
    slot.completedAt = new Date();
    await slot.save();
    if (menteeId) await User.updateOne({ _id: menteeId }, { $inc: { noShows: 1 } });
    return ok({ slot: { _id: slotId, status: slot.status } });
  }

  slot.status = 'completed';
  slot.completedAt = new Date();
  await slot.save();

  /*
   * Credited once the session actually happened, and keyed on the slot id — the
   * unique (user, action, entity) ledger index makes a repeat call a no-op, so
   * a double-tap or retry cannot pay twice.
   */
  await award(userId, 'mock_hosted', { entityType: 'slot', entity: slotId });
  await User.updateOne({ _id: userId }, { $inc: { sessionsHosted: 1 } });
  await evaluateContributionBadges(userId);

  if (menteeId) {
    await award(menteeId, 'mock_attended', { entityType: 'slot', entity: slotId });
    await User.updateOne({ _id: menteeId }, { $inc: { sessionsAttended: 1 } });

    await notify({
      user: menteeId,
      kind: 'feedback_requested',
      title: 'How did that session go?',
      body: 'Rate your mentor and leave a note — it takes a minute and keeps quality honest.',
      href: '/sessions?view=bookings',
      entityType: 'slot',
      entity: slotId,
      actor: userId,
    });
  }

  return ok({ slot: { _id: slotId, status: slot.status } });
}
