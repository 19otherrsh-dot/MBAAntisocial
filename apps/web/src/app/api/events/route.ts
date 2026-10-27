import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import Event, { EVENT_CATEGORIES } from '@/models/campus/Event';
import Club from '@/models/campus/Club';
import { newCheckInCode, peopleFor, viewEvent } from '@/server/modules/campus-life/events';
import { canManageClub } from '@/server/modules/campus-life/clubs';

const querySchema = z.object({
  scope: z.enum(['upcoming', 'mine', 'past']).default('upcoming'),
  category: z.enum(EVENT_CATEGORIES).optional(),
  club: objectId.optional(),
});

export const GET = route({ feature: 'events', query: querySchema }, async ({ actor, query }) => {
  const now = new Date();
  const filter: Record<string, unknown> = { campus: actor.campus };
  if (query.scope === 'upcoming') Object.assign(filter, { status: 'scheduled', endAt: { $gte: now } });
  if (query.scope === 'past') Object.assign(filter, { endAt: { $lt: now } });
  if (query.scope === 'mine') Object.assign(filter, { $or: [{ 'rsvps.user': actor.id }, { host: actor.id }], endAt: { $gte: new Date(now.getTime() - 7 * 86_400_000) } });
  if (query.category) filter.category = query.category;
  if (query.club) filter.club = query.club;
  const events = await Event.find(filter).sort(query.scope === 'past' ? { startAt: -1 } : { startAt: 1 }).limit(60).lean();
  const people = await peopleFor([...new Set(events.flatMap((e) => [e.host, ...e.rsvps.filter((r) => r.status === 'going').slice(0, 12).map((r) => r.user)]).map(String))]);
  const clubs = await Club.find({ _id: { $in: events.flatMap((e) => (e.club ? [e.club] : [])) } }).select('name slug').lean();
  const clubOf = new Map(clubs.map((c) => [String(c._id), { name: c.name, slug: c.slug }]));
  return ok({
    events: events.map((e) => ({ ...viewEvent(e, actor.id, String(e.host) === actor.id, people), clubInfo: e.club ? clubOf.get(String(e.club)) ?? null : null })),
  });
});

const createSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(4000).default(''),
    category: z.enum(EVENT_CATEGORIES).default('other'),
    club: objectId.optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    venue: z.string().trim().max(120).default(''),
    onlineUrl: z.union([z.literal(''), z.string().url().max(500)]).default(''),
    capacity: z.number().int().min(0).max(100_000).default(0),
    coverImage: z.string().max(500).default(''),
  })
  .refine((e) => e.endAt > e.startAt, { message: 'An event has to end after it starts.', path: ['endAt'] });

export const POST = route({ feature: 'events', body: createSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  if (body.startAt.getTime() < Date.now() - 60 * 60_000) throw ApiError.unprocessable('Pick a time in the future.');
  if (body.club) {
    const club = await Club.findOne({ _id: body.club, campus: actor.campus }).select('members').lean();
    if (!club || !canManageClub(club, actor.id)) throw ApiError.forbidden('Only a club’s leads and core team can post its events.');
  }
  const event = await Event.create({ ...body, campus: actor.campus, host: actor.id, checkInCode: newCheckInCode(), rsvps: [{ user: actor.id, status: 'going', at: new Date(), checkedIn: false }], goingCount: 1 });
  return created({ event: { _id: String(event._id) } });
});
