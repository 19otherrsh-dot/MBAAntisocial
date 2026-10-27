import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import { sessionTemplateSchema } from '@/lib/validation';
import { SESSION_TYPES } from '@/lib/constants';
import SessionTemplate from '@/models/SessionTemplate';
import { award } from '@/lib/gamification';

const querySchema = z.object({ sessionType: z.enum(SESSION_TYPES).optional(), q: z.string().trim().max(60).optional() });

/** Crowd-sourced mock templates for the caller's campus, most useful first. */
export const GET = route({ query: querySchema, feature: 'sessions' }, async ({ actor, query }) => {
  const filter: Record<string, unknown> = { campus: actor.campus, hiddenAt: { $exists: false } };
  if (query.sessionType) filter.sessionType = query.sessionType;
  if (query.q) filter.$or = [{ title: new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { company: new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
  const rows = await SessionTemplate.find(filter).sort({ upvoteCount: -1, uses: -1 }).limit(60).populate('author', 'name').lean();
  return ok({
    templates: rows.map((t) => ({
      ...t,
      _id: String(t._id),
      upvoted: t.upvotes.some((u) => String(u) === actor.id),
      upvotes: undefined,
      mine: String((t.author as unknown as { _id: unknown })?._id ?? t.author) === actor.id,
    })),
  });
});

export const POST = route({ body: sessionTemplateSchema, rateLimit: 'post', feature: 'sessions' }, async ({ actor, body }) => {
  const template = await SessionTemplate.create({ ...body, campus: actor.campus, author: actor.id });
  await award(actor.id, 'tip_shared', { entityType: 'template', entity: template._id });
  return created({ template: { ...template.toObject(), _id: String(template._id) } });
});
