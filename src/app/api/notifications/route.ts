import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { notificationActionSchema } from '@/lib/validation';
import Notification from '@/models/Notification';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const GET = route({ query: querySchema }, async ({ actor, query }) => {
  const filter: Record<string, unknown> = { user: actor.id };
  if (query.unreadOnly) filter.readAt = { $exists: false };

  const [notifications, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(query.limit)
      .populate('actor', 'name image')
      .lean(),
    Notification.countDocuments({ user: actor.id, readAt: { $exists: false } }),
  ]);

  return ok({
    notifications: notifications.map((n) => ({ ...n, _id: String(n._id) })),
    unread,
  });
});

export const PATCH = route(
  { body: notificationActionSchema, rateLimit: 'write' },
  async ({ actor, body }) => {
    // Scoped to the caller in the filter, so a foreign id simply matches nothing.
    if (body.action === 'mark_all_read') {
      const result = await Notification.updateMany(
        { user: actor.id, readAt: { $exists: false } },
        { $set: { readAt: new Date() } }
      );
      return ok({ marked: result.modifiedCount });
    }

    await Notification.updateOne(
      { _id: body.notificationId, user: actor.id },
      { $set: { readAt: new Date() } }
    );
    return ok({ marked: 1 });
  }
);
