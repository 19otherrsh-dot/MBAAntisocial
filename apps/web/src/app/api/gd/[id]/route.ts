import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { gdFeedbackSchema, objectId } from '@/lib/validation';
import GdSession from '@/models/GdSession';
import { award } from '@/lib/gamification';
import { notifyMany } from '@/lib/notifications';
import { earnCredits } from '@/server/modules/credits/service';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join') }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('complete') }),
  gdFeedbackSchema.extend({ action: z.literal('feedback') }),
]);

export const PATCH = route({ body: actionSchema, rateLimit: 'booking', feature: 'sessions' }, async ({ actor, body, params }) => {
  const id = objectId.parse(params.id);
  const session = await GdSession.findOne({ _id: id, campus: actor.campus });
  if (!session) throw ApiError.notFound('That GD no longer exists.');
  const isModerator = String(session.moderator ?? '') === actor.id;

  switch (body.action) {
    case 'join': {
      if (session.status !== 'scheduled') throw ApiError.conflict('That GD is not taking people.');
      if (isModerator) throw ApiError.badRequest('You are moderating this one.');
      // Atomic: capacity and "not already in" checked in the same update.
      const updated = await GdSession.findOneAndUpdate(
        { _id: id, status: 'scheduled', participants: { $ne: actor.id }, $expr: { $lt: [{ $size: '$participants' }, '$capacity'] } },
        { $push: { participants: actor.id } },
        { new: true }
      );
      if (!updated) throw ApiError.conflict('That GD is full, or you are already in it.');
      return ok({ joined: true, meetingLink: updated.meetingLink });
    }
    case 'leave': {
      await GdSession.updateOne({ _id: id, status: 'scheduled' }, { $pull: { participants: actor.id } });
      return ok({ left: true });
    }
    case 'cancel': {
      if (!isModerator && !actor.canModerate) throw ApiError.forbidden();
      session.status = 'cancelled';
      await session.save();
      await notifyMany(
        session.participants.map((user) => ({
          user,
          kind: 'slot_cancelled' as const,
          title: 'A GD you joined was cancelled',
          body: session.topic,
          href: '/sessions?view=gd',
          actor: actor.id,
        }))
      );
      return ok({ cancelled: true });
    }
    case 'complete': {
      if (!isModerator) throw ApiError.forbidden('Only the moderator closes a GD.');
      if (session.startAt > new Date()) throw ApiError.conflict('It has not happened yet.');
      session.status = 'completed';
      await session.save();
      await Promise.all(session.participants.map((p) => award(String(p), 'mock_attended', { entityType: 'gd', entity: session._id })));
      await award(actor.id, 'gd_moderated', { entityType: 'gd', entity: session._id });
      await earnCredits(actor.id, 'gd_moderated', String(session._id));
      return ok({ completed: true });
    }
    case 'feedback': {
      if (!isModerator) throw ApiError.forbidden('Only the moderator scores a GD.');
      const allowed = new Set(session.participants.map(String));
      for (const entry of body.feedback) {
        if (!allowed.has(entry.userId)) continue;
        session.feedback = session.feedback.filter((f) => String(f.user) !== entry.userId);
        session.feedback.push({ user: entry.userId as never, scores: new Map(Object.entries(entry.scores)), comment: entry.comment });
      }
      await session.save();
      await notifyMany(
        body.feedback
          .filter((f) => allowed.has(f.userId))
          .map((f) => ({
            user: f.userId,
            kind: 'feedback_received' as const,
            title: 'Your GD feedback is in',
            body: session.topic,
            href: '/sessions?view=gd',
            actor: actor.id,
          }))
      );
      return ok({ saved: true });
    }
  }
});
