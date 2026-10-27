import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import Club, { CLUB_CATEGORIES } from '@/models/campus/Club';
import { createClub, memberOf } from '@/server/modules/campus-life/clubs';

const querySchema = z.object({ category: z.enum(CLUB_CATEGORIES).optional(), mine: z.coerce.boolean().optional(), q: z.string().trim().max(60).optional() });

export const GET = route({ feature: 'clubs', query: querySchema }, async ({ actor, query }) => {
  const filter: Record<string, unknown> = { campus: actor.campus, archivedAt: { $exists: false } };
  if (query.category) filter.category = query.category;
  if (query.mine) filter['members.user'] = actor.id;
  if (query.q) filter.name = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const clubs = await Club.find(filter).sort({ official: -1, memberCount: -1 }).limit(100).select('-budget -tasks').lean();
  return ok({
    clubs: clubs.map((c) => ({
      _id: String(c._id),
      slug: c.slug,
      name: c.name,
      tagline: c.tagline,
      category: c.category,
      logo: c.logo,
      official: c.official,
      memberCount: c.memberCount,
      recruiting: c.recruitment.open && (!c.recruitment.deadline || c.recruitment.deadline > new Date()),
      myRole: memberOf(c, actor.id)?.role ?? null,
    })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(3).max(80),
  tagline: z.string().trim().max(140).default(''),
  description: z.string().trim().max(4000).default(''),
  category: z.enum(CLUB_CATEGORIES).default('professional'),
});

export const POST = route({ feature: 'clubs', body: createSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const club = await createClub(actor, body);
  return created({ club: { _id: String(club._id), slug: club.slug } });
});
