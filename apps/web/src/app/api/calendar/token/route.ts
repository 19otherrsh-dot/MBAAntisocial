import { route, ok } from '@/lib/api/handler';
import User from '@/models/User';
import { feedUrl } from '@/server/modules/calendar/feed';

/** The caller's private subscription link. */
export const GET = route({}, async ({ actor }) => {
  const user = await User.findById(actor.id).select('calendarFeedVersion').lean();
  return ok({ url: feedUrl(actor.id, user?.calendarFeedVersion ?? 1) });
});

/** Issues a new link; the old one stops working. */
export const POST = route({ rateLimit: 'write' }, async ({ actor }) => {
  const user = await User.findByIdAndUpdate(actor.id, { $inc: { calendarFeedVersion: 1 } }, { new: true }).select('calendarFeedVersion').lean();
  return ok({ url: feedUrl(actor.id, user?.calendarFeedVersion ?? 1) });
});
