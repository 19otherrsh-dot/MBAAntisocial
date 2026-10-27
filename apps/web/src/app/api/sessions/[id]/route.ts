import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { slotActionSchema, objectId } from '@/lib/validation';
import { assertNoMentorConflict, isInsideNoticeWindow } from '@/lib/scheduling';
import { award, evaluateContributionBadges } from '@/lib/gamification';
import { notify } from '@/lib/notifications';
import InterviewSlot from '@/models/InterviewSlot';
import SessionTemplate from '@/models/SessionTemplate';
import User from '@/models/User';
import { CANCELLATION_NOTICE_HOURS, MAX_ACTIVE_BOOKINGS_PER_MENTEE, SESSION_TYPE_META } from '@/lib/constants';
import { formatDateTime } from '@/lib/utils';
import { provisionMeeting, releaseMeeting } from '@/server/modules/sessions/meetings';
import { canBookAcross } from '@/server/modules/sessions/cross-campus';
import { earnCredits, hasPriorityBooking } from '@/server/modules/credits/service';
import type { MeetingProviderId } from '@/server/ports/meetings';
import { serialiseSlot } from '../route';

const MENTOR_FIELDS = 'name image year campus specializations mentorProfile.headline mentorProfile.offers karma mentorRating badges';
const MENTEE_FIELDS = 'name image year batch campus';

/**
 * Acts on a single slot: book, cancel, reschedule, complete, consent, or set a
 * link. Every branch re-reads the slot and checks the caller's relationship to
 * it — holding a slot id is never sufficient authorisation.
 */
export const PATCH = route({ body: slotActionSchema, rateLimit: 'booking', feature: 'sessions' }, async ({ actor, body, params }) => {
  const slotId = objectId.parse(params.id);

  switch (body.action) {
    case 'book':
      return book(actor.id, actor.campus, slotId, body.bookingNote, body.templateId, body.consentToRecording);
    case 'cancel':
      return cancel(actor.id, slotId, body.reason);
    case 'reschedule':
      return reschedule(actor.id, slotId, body.startAt, body.endAt);
    case 'complete':
      return complete(actor.id, slotId, body.noShow);
    case 'consent':
      return consent(actor.id, slotId, body.consentToRecording);
    case 'set_link':
      return setLink(actor.id, slotId, body.meetingLink);
  }
});

/** Withdraws an unbooked slot. Booked slots must be cancelled, not deleted. */
export const DELETE = route({ rateLimit: 'write' }, async ({ actor, params }) => {
  const slotId = objectId.parse(params.id);
  const deleted = await InterviewSlot.findOneAndDelete({ _id: slotId, mentor: actor.id, status: 'available' });
  if (!deleted) throw ApiError.conflict('That slot is either booked or not yours to remove.');
  return ok({ deleted: true });
});

// ───────────────────────── Book ─────────────────────────

async function book(
  userId: string,
  campus: string,
  slotId: string,
  bookingNote: string,
  templateId: string | undefined,
  consentToRecording: boolean
) {
  const slot = await InterviewSlot.findById(slotId).select('mentor campus startAt endAt status sessionType');
  // Reported as "not found" rather than "forbidden" so slot ids on other
  // campuses cannot be probed for existence.
  if (!slot) throw ApiError.notFound('That slot no longer exists.');

  const crossCampus = slot.campus !== campus;
  if (crossCampus && !(await canBookAcross(campus, slot.mentor.toString()))) {
    throw ApiError.notFound('That slot no longer exists.');
  }
  if (slot.mentor.toString() === userId) throw ApiError.badRequest('You cannot book your own slot.');
  if (slot.startAt.getTime() <= Date.now()) throw ApiError.conflict('That slot has already started.');

  // The burnout guard (§11), with one extra booking for anyone who bought the perk.
  const cap = MAX_ACTIVE_BOOKINGS_PER_MENTEE + ((await hasPriorityBooking(userId)) ? 1 : 0);
  const active = await InterviewSlot.countDocuments({ bookedBy: userId, status: 'booked', startAt: { $gte: new Date() } });
  if (active >= cap) {
    throw ApiError.conflict(`You already have ${active} sessions lined up. Finish one before booking another.`);
  }

  if (templateId) {
    const template = await SessionTemplate.exists({ _id: templateId, campus: { $in: [campus, slot.campus] }, hiddenAt: { $exists: false } });
    if (!template) throw ApiError.unprocessable('That prep template is not available.');
  }

  /*
   * Conditional update rather than read-then-write. Two juniors tapping "book"
   * on the same slot at the same moment both pass the checks above; only the
   * one whose update matches `status: 'available'` wins.
   */
  const booked = await InterviewSlot.findOneAndUpdate(
    { _id: slotId, status: 'available' },
    {
      $set: {
        status: 'booked',
        bookedBy: userId,
        bookedAt: new Date(),
        bookingNote,
        template: templateId,
        menteeCampus: campus,
        'recordingConsent.mentee': consentToRecording,
        'recordingConsent.mentor': false,
      },
    },
    { new: true }
  );
  if (!booked) throw ApiError.conflict('Someone just took that slot.');
  if (templateId) await SessionTemplate.updateOne({ _id: templateId }, { $inc: { uses: 1 } });

  const [mentor, mentee] = await Promise.all([
    User.findById(booked.mentor).select('name email mentorProfile.meetingProvider mentorProfile.meetingLink').lean(),
    User.findById(userId).select('name email').lean(),
  ]);

  // Every booking gets somewhere to meet: the mentor's provider, their link, or a Jitsi room.
  const meeting = await provisionMeeting({
    referenceId: String(booked._id),
    sessionType: booked.sessionType,
    startAt: booked.startAt,
    endAt: booked.endAt,
    note: bookingNote,
    host: {
      id: String(booked.mentor),
      name: mentor?.name ?? 'Mentor',
      email: mentor?.email ?? '',
      preferred: (mentor?.mentorProfile?.meetingProvider ?? 'manual') as MeetingProviderId,
      standingLink: mentor?.mentorProfile?.meetingLink ?? '',
    },
    attendee: { id: userId, name: mentee?.name ?? 'Junior', email: mentee?.email ?? '' },
  });

  booked.meetingLink = meeting.link;
  booked.meetingProvider = meeting.provider;
  booked.meetingExternalId = meeting.externalId;
  booked.meetingHostUrl = meeting.hostUrl;
  await booked.save();

  /*
   * No points are awarded here: paying out on booking made book-cancel-rebook
   * an unbounded points loop. Both parties are credited on completion.
   */
  const type = SESSION_TYPE_META[booked.sessionType].label;
  await notify({
    user: booked.mentor,
    kind: 'slot_booked',
    title: `${mentee?.name ?? 'A junior'} booked your ${type.toLowerCase()}${crossCampus ? ` (from ${campus})` : ''}`,
    body: `${formatDateTime(booked.startAt)}${meeting.fallbackReason ? ` — used a backup link: ${meeting.fallbackReason}` : ''}${bookingNote ? ` — "${bookingNote.slice(0, 120)}"` : ''}`,
    href: '/sessions?view=hosting',
    entityType: 'slot',
    entity: slotId,
    actor: userId,
  });
  await notify({
    user: userId,
    kind: 'slot_booked',
    title: `Booked: ${type} with ${mentor?.name ?? 'your mentor'}`,
    body: `${formatDateTime(booked.startAt)}. The meeting link is on the session card.`,
    href: '/sessions?view=bookings',
    entityType: 'slot',
    entity: slotId,
  });

  const populated = await InterviewSlot.findById(slotId)
    .populate('mentor', MENTOR_FIELDS)
    .populate('bookedBy', MENTEE_FIELDS)
    .populate('template', 'title company roundType prompts lookFor')
    .lean();
  return ok({ slot: serialiseSlot(populated!, userId), meetingFallback: meeting.fallbackReason ?? null });
}

// ───────────────────────── Cancel ─────────────────────────

async function cancel(userId: string, slotId: string, reason: string) {
  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound('That slot no longer exists.');

  const isMentor = slot.mentor.toString() === userId;
  const isMentee = slot.bookedBy?.toString() === userId;
  if (!isMentor && !isMentee) throw ApiError.forbidden('That is not your session.');
  if (slot.status !== 'booked') throw ApiError.conflict('Only a booked session can be cancelled.');

  const late = isInsideNoticeWindow(slot.startAt);
  const counterpartyId = isMentor ? slot.bookedBy : slot.mentor;

  await releaseMeeting(String(slot.mentor), slot.meetingProvider, slot.meetingExternalId);

  /*
   * A mentor cancelling retires the slot; a mentee cancelling releases it back
   * to the pool (re-listing a time the mentor just said they cannot make would
   * be wrong the other way round).
   */
  if (isMentor) {
    slot.status = 'cancelled';
    slot.cancelledBy = slot.mentor;
  } else {
    slot.status = 'available';
    slot.bookedBy = undefined;
    slot.bookedAt = undefined;
    slot.bookingNote = '';
    slot.template = undefined;
    slot.menteeCampus = '';
    slot.recordingConsent = { mentor: false, mentee: false };
  }
  slot.meetingLink = '';
  slot.meetingProvider = '';
  slot.meetingExternalId = '';
  slot.meetingHostUrl = '';
  slot.cancelledAt = new Date();
  slot.cancellationReason = reason;
  slot.wasLateCancellation = late;
  await slot.save();

  // Visible on the profile so a pattern of last-minute drops shows; nothing is auto-penalised.
  if (late) await User.updateOne({ _id: userId }, { $inc: { lateCancellations: 1 } });

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

  return ok({ slot: { _id: slotId, status: slot.status }, wasLateCancellation: late, noticeHours: CANCELLATION_NOTICE_HOURS });
}

// ───────────────────────── Reschedule ─────────────────────────

async function reschedule(userId: string, slotId: string, startAt: Date, endAt: Date) {
  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound('That slot no longer exists.');
  // Only the mentor owns the time; a mentee who cannot make it cancels instead.
  if (slot.mentor.toString() !== userId) throw ApiError.forbidden('Only the host can move a session.');
  if (slot.status !== 'available' && slot.status !== 'booked') throw ApiError.conflict('That session can no longer be moved.');

  await assertNoMentorConflict(userId, startAt, endAt, slotId);

  const previousStart = slot.startAt;
  slot.rescheduleHistory.push({ from: previousStart, to: startAt, by: slot.mentor, at: new Date() });
  slot.startAt = startAt;
  slot.endAt = endAt;

  // A calendar-backed meeting carries the old time, so it is replaced.
  if (slot.status === 'booked' && slot.bookedBy && (slot.meetingProvider === 'google_meet' || slot.meetingProvider === 'zoom')) {
    await releaseMeeting(String(slot.mentor), slot.meetingProvider, slot.meetingExternalId);
    const [mentor, mentee] = await Promise.all([
      User.findById(slot.mentor).select('name email mentorProfile.meetingProvider mentorProfile.meetingLink').lean(),
      User.findById(slot.bookedBy).select('name email').lean(),
    ]);
    const meeting = await provisionMeeting({
      referenceId: `${slotId}-${slot.rescheduleHistory.length}`,
      sessionType: slot.sessionType,
      startAt,
      endAt,
      note: slot.bookingNote,
      host: {
        id: String(slot.mentor),
        name: mentor?.name ?? 'Mentor',
        email: mentor?.email ?? '',
        preferred: (mentor?.mentorProfile?.meetingProvider ?? 'manual') as MeetingProviderId,
        standingLink: mentor?.mentorProfile?.meetingLink ?? '',
      },
      attendee: { id: String(slot.bookedBy), name: mentee?.name ?? 'Junior', email: mentee?.email ?? '' },
    });
    slot.meetingLink = meeting.link;
    slot.meetingProvider = meeting.provider;
    slot.meetingExternalId = meeting.externalId;
    slot.meetingHostUrl = meeting.hostUrl;
  }
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

  return ok({ slot: { _id: slotId, startAt, endAt, meetingLink: slot.meetingLink } });
}

// ───────────────────────── Complete ─────────────────────────

async function complete(userId: string, slotId: string, noShow: boolean) {
  const slot = await InterviewSlot.findById(slotId);
  if (!slot) throw ApiError.notFound('That slot no longer exists.');
  if (slot.mentor.toString() !== userId) throw ApiError.forbidden('Only the host can close out a session.');
  if (slot.status !== 'booked') throw ApiError.conflict('That session is not in a state that can be completed.');
  if (slot.startAt.getTime() > Date.now()) throw ApiError.conflict('That session has not happened yet.');

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
   * Credited once the session actually happened, keyed on the slot id — the
   * unique ledger index makes a repeat call a no-op, so a retry cannot pay twice.
   */
  await award(userId, 'mock_hosted', { entityType: 'slot', entity: slotId });
  await earnCredits(userId, 'session_hosted', slotId);
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

// ───────────────────────── Recording consent & link ─────────────────────────

/**
 * §6.1 V2: recording happens only when both people said yes, and either can
 * withdraw before the session. The flag is shown on both cards; the recording
 * itself is done in the meeting tool, for self-review only.
 */
async function consent(userId: string, slotId: string, value: boolean) {
  const slot = await InterviewSlot.findById(slotId).select('mentor bookedBy status startAt recordingConsent');
  if (!slot) throw ApiError.notFound('That slot no longer exists.');
  const role = slot.mentor.toString() === userId ? 'mentor' : slot.bookedBy?.toString() === userId ? 'mentee' : null;
  if (!role) throw ApiError.forbidden('That is not your session.');
  if (slot.status !== 'booked') throw ApiError.conflict('Consent can only change on an upcoming session.');
  slot.recordingConsent[role] = value;
  await slot.save();
  const both = slot.recordingConsent.mentor && slot.recordingConsent.mentee;
  return ok({ recordingConsent: slot.recordingConsent, recordingAllowed: both });
}

async function setLink(userId: string, slotId: string, link: string) {
  const slot = await InterviewSlot.findOne({ _id: slotId, mentor: userId, status: { $in: ['available', 'booked'] } });
  if (!slot) throw ApiError.notFound('That slot is not yours or no longer open.');
  await releaseMeeting(userId, slot.meetingProvider, slot.meetingExternalId);
  slot.meetingLink = link;
  slot.meetingProvider = 'manual';
  slot.meetingExternalId = '';
  slot.meetingHostUrl = '';
  await slot.save();
  if (slot.bookedBy) {
    await notify({
      user: slot.bookedBy,
      kind: 'slot_rescheduled',
      title: 'Your session has a new meeting link',
      body: formatDateTime(slot.startAt),
      href: '/sessions?view=bookings',
      entityType: 'slot',
      entity: slotId,
      actor: userId,
    });
  }
  return ok({ slot: { _id: slotId, meetingLink: link } });
}
