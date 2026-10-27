import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import Event, { EVENT_CATEGORIES } from '@/models/campus/Event';
import Club from '@/models/campus/Club';
import { canManageEvent, cancelEvent, checkIn, loadEvent, peopleFor, rsvp, viewEvent } from '@/server/modules/campus-life/events';
import { notifyMany } from '@/lib/notifications';

export const GET = route({ feature: 'events' }, async ({ actor, params }) => {
  const event = await loadEvent(params.id, actor.campus);
  const canManage = await canManageEvent(event, actor);
  const people = await peopleFor([event.host, ...event.rsvps.map((r) => r.user)]);
  const club = event.club ? await Club.findById(event.club).select('name slug').lean() : null;
  return ok({
    event: { ...viewEvent(event, actor.id, canManage, people), clubInfo: club ? { name: club.name, slug: club.slug } : null },
    // The full list is for organisers (who need it at the door).
    guestList: canManage ? event.rsvps.map((r) => ({ _id: String(r.user), name: people.get(String(r.user))?.name ?? 'Someone', status: r.status, checkedIn: r.checkedIn })) : undefined,
  });
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rsvp'), status: z.enum(['going', 'interested']).nullable() }),
  z.object({ action: z.literal('check_in'), code: z.string().regex(/^\d{4}$/) }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('announce'), message: z.string().trim().min(3).max(500) }),
  z.object({
    action: z.literal('edit'),
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().max(4000).optional(),
    category: z.enum(EVENT_CATEGORIES).optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    venue: z.string().trim().max(120).optional(),
    onlineUrl: z.union([z.literal(''), z.string().url().max(500)]).optional(),
    capacity: z.number().int().min(0).max(100_000).optional(),
  }),
]);

export const POST = route({ feature: 'events', body: actionSchema, rateLimit: 'write' }, async ({ actor, params, body }) => {
  switch (body.action) {
    case 'rsvp':
      return ok({ status: await rsvp(params.id, actor, body.status) });
    case 'check_in':
      await checkIn(params.id, actor, body.code);
      return ok({ checkedIn: true });
    case 'cancel':
      await cancelEvent(params.id, actor);
      return ok({ cancelled: true });
    case 'announce': {
      const event = await loadEvent(params.id, actor.campus);
      if (!(await canManageEvent(event, actor))) throw ApiError.forbidden('Only the organisers can message attendees.');
      await notifyMany(event.rsvps.map((r) => ({ user: r.user, kind: 'event_update' as const, title: event.title, body: body.message, href: `/events/${event._id}`, actor: actor.id, entityType: 'Event', entity: event._id })));
      return ok({ sent: event.rsvps.length });
    }
    case 'edit': {
      const event = await loadEvent(params.id, actor.campus);
      if (!(await canManageEvent(event, actor))) throw ApiError.forbidden('Only the organisers can edit this.');
      const { action: _action, ...changes } = body;
      const startAt = changes.startAt ?? event.startAt;
      const endAt = changes.endAt ?? event.endAt;
      if (endAt <= startAt) throw ApiError.unprocessable('An event has to end after it starts.');
      await Event.updateOne({ _id: event._id }, { $set: changes });
      // A moved event is news for everyone coming.
      if (changes.startAt || changes.venue) {
        await notifyMany(event.rsvps.filter((r) => String(r.user) !== actor.id).map((r) => ({ user: r.user, kind: 'event_update' as const, title: `Updated: ${changes.title ?? event.title}`, body: 'The time or venue changed — check the details.', href: `/events/${event._id}`, entityType: 'Event', entity: event._id })));
      }
      return ok({ updated: true });
    }
  }
});
