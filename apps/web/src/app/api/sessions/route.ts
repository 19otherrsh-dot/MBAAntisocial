import { route, ok, created, paginate, pageMeta } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createSlotSchema, slotQuerySchema } from '@/lib/validation';
import { assertNoMentorConflict } from '@/lib/scheduling';
import { crossCampusMentorIds } from '@/server/modules/sessions/cross-campus';
import InterviewSlot from '@/models/InterviewSlot';
import User from '@/models/User';
import type { QueryFilter } from 'mongoose';
import type { IInterviewSlot } from '@/models/InterviewSlot';
import { serialiseSlot } from '@/server/modules/sessions/serialise';

const MENTOR_FIELDS = 'name image year campus specializations mentorProfile.headline mentorProfile.offers mentorProfile.companies mentorProfile.meetingProvider karma mentorRating badges';
const MENTEE_FIELDS = 'name image year batch';

/**
 * Lists sessions in one of three views.
 *
 * Every view is scoped to the caller's campus. The previous implementation
 * filtered only on status and date, so a student at one school could see and
 * book slots published at another — the opposite of the campus-native model in
 * §6.1, and a privacy leak besides.
 */
export const GET = route({ query: slotQuerySchema, feature: 'sessions' }, async ({ actor, query }) => {
  const { skip, limit } = paginate(query);

  const filter: QueryFilter<IInterviewSlot> = {};

  if (query.view === 'open') {
    filter.status = 'available';
    filter.startAt = { $gte: new Date() };
    if (query.scope === 'cross') {
      // Other campuses' mentors who opted in, where both campuses allow it.
      const ids = await crossCampusMentorIds(actor.campus);
      filter.mentor = { $in: query.mentor ? ids.filter((id) => id === query.mentor) : ids };
    } else {
      filter.campus = actor.campus;
      filter.mentor = query.mentor && query.mentor !== actor.id ? query.mentor : { $ne: actor.id };
    }
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
      .populate('template', 'title company roundType prompts lookFor')
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
  { body: createSlotSchema, requireMentor: true, rateLimit: 'write', feature: 'sessions' },
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
