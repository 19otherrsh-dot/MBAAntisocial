import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import LostItem from '@/models/campus/LostItem';
import { container } from '@/server/container';

const querySchema = z.object({ kind: z.enum(['lost', 'found']).optional(), resolved: z.coerce.boolean().optional() });

export const GET = route({ feature: 'feed', query: querySchema }, async ({ actor, query }) => {
  const filter: Record<string, unknown> = { campus: actor.campus, status: query.resolved ? 'resolved' : 'open' };
  if (query.kind) filter.kind = query.kind;
  const items = await LostItem.find(filter).sort({ createdAt: -1 }).limit(80).populate<{ reporter: { _id: unknown; name: string; image: string } }>('reporter', 'name image').lean();
  return ok({
    items: items.map((i) => ({ _id: String(i._id), kind: i.kind, title: i.title, description: i.description, location: i.location, when: i.when, image: i.image, status: i.status, reporter: { _id: String(i.reporter._id), name: i.reporter.name, image: i.reporter.image }, mine: String(i.reporter._id) === actor.id, createdAt: i.createdAt })),
  });
});

const schema = z.object({
  kind: z.enum(['lost', 'found']),
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(1000).default(''),
  location: z.string().trim().max(100).default(''),
  when: z.coerce.date().default(() => new Date()),
  image: z.string().max(500).default(''),
});

export const POST = route({ feature: 'feed', body: schema, rateLimit: 'post' }, async ({ actor, body }) => {
  if (body.image && !container().storage.isOwnUrl(body.image)) throw ApiError.badRequest('Upload the photo here rather than linking it.');
  const item = await LostItem.create({ ...body, campus: actor.campus, reporter: actor.id });
  return created({ item: { _id: String(item._id) } });
});
