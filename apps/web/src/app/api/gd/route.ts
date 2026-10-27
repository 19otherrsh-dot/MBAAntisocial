import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { gdHostSchema, gdQueueSchema } from '@/lib/validation';
import GdSession from '@/models/GdSession';
import GdQueueEntry from '@/models/GdQueueEntry';
import { gdMeeting, joinQueueAndMatch } from '@/server/modules/gd/service';
import { GD_RUBRIC } from '@/server/modules/gd/topics';
import { z } from 'zod';

const PEOPLE = 'name image year batch';

/** Upcoming GD rooms on campus, the caller's own rooms, and their queue entry. */
export const GET = route({ feature: 'sessions' }, async ({ actor }) => {
  const now = new Date(Date.now() - 2 * 60 * 60_000);
  const [open, mine, queue] = await Promise.all([
    GdSession.find({ campus: actor.campus, status: { $in: ['scheduled', 'live'] }, startAt: { $gte: now } })
      .sort({ startAt: 1 })
      .limit(30)
      .populate('moderator', PEOPLE)
      .populate('participants', PEOPLE)
      .lean(),
    GdSession.find({ $or: [{ participants: actor.id }, { moderator: actor.id }] })
      .sort({ startAt: -1 })
      .limit(20)
      .populate('moderator', PEOPLE)
      .populate('participants', PEOPLE)
      .lean(),
    GdQueueEntry.findOne({ campus: actor.campus, user: actor.id }).lean(),
  ]);

  const shape = (s: (typeof open)[number]) => {
    const isIn = s.participants.some((p) => String((p as unknown as { _id: unknown })._id) === actor.id);
    const isModerator = String((s.moderator as unknown as { _id?: unknown } | undefined)?._id ?? '') === actor.id;
    return {
      ...s,
      _id: String(s._id),
      joined: isIn,
      moderating: isModerator,
      // The room link is for people in the room.
      meetingLink: isIn || isModerator ? s.meetingLink : '',
      feedback: isModerator ? s.feedback : s.feedback.filter((f) => String(f.user) === actor.id),
    };
  };

  return ok({
    open: open.map(shape),
    mine: mine.map(shape),
    queue: queue ? { windows: queue.windows, track: queue.track } : null,
    rubric: GD_RUBRIC,
  });
});

const bodySchema = z.discriminatedUnion('mode', [
  gdHostSchema.extend({ mode: z.literal('host') }),
  gdQueueSchema.extend({ mode: z.literal('queue') }),
]);

/**
 * Either host a GD as moderator (seniors), or join the matching queue. The
 * queue forms a room as soon as four people share a window.
 */
export const POST = route({ body: bodySchema, rateLimit: 'booking', feature: 'sessions' }, async ({ actor, body }) => {
  if (body.mode === 'host') {
    if (!actor.canMentor) throw ApiError.forbidden('Seniors and alumni moderate GDs; join the queue to practise.');
    const session = new GdSession({
      campus: actor.campus,
      topic: body.topic,
      brief: body.brief,
      startAt: body.startAt,
      durationMinutes: body.durationMinutes,
      capacity: body.capacity,
      moderator: actor.id,
      participants: [],
      origin: 'hosted',
    });
    const meeting = await gdMeeting(session);
    session.meetingLink = meeting.link;
    session.meetingProvider = meeting.provider;
    await session.save();
    return created({ session: { ...session.toObject(), _id: String(session._id) } });
  }

  const { formed } = await joinQueueAndMatch({ userId: actor.id, campus: actor.campus, windows: body.windows, track: body.track });
  return ok({ queued: formed.length === 0, formed });
});

export const DELETE = route({ feature: 'sessions' }, async ({ actor }) => {
  await GdQueueEntry.deleteOne({ campus: actor.campus, user: actor.id });
  return ok({ left: true });
});
