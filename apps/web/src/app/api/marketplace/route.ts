import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import Listing, { LISTING_CATEGORIES } from '@/models/campus/Listing';
import { container } from '@/server/container';
import { listingView } from '@/server/modules/campus-life/listings';

const querySchema = z.object({ category: z.enum(LISTING_CATEGORIES).optional(), q: z.string().trim().max(60).optional(), mine: z.coerce.boolean().optional() });

export const GET = route({ feature: 'marketplace', query: querySchema }, async ({ actor, query }) => {
  const filter: Record<string, unknown> = { campus: actor.campus };
  if (query.mine) Object.assign(filter, { seller: actor.id, status: { $ne: 'removed' } });
  else filter.status = { $in: ['active', 'reserved'] };
  if (query.category) filter.category = query.category;
  if (query.q) filter.$or = [{ title: new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { description: new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
  const rows = await Listing.find(filter).sort({ boostedUntil: -1, createdAt: -1 }).limit(80).populate<{ seller: { _id: unknown; name: string; image: string; batch: string } }>('seller', 'name image batch').lean();
  const now = Date.now();
  // Boosts only lift a listing while they last.
  rows.sort((a, b) => Number((b.boostedUntil?.getTime() ?? 0) > now) - Number((a.boostedUntil?.getTime() ?? 0) > now) || b.createdAt.getTime() - a.createdAt.getTime());
  return ok({ listings: rows.map((l) => listingView(l, actor.id)) });
});

const schema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(2000).default(''),
  category: z.enum(LISTING_CATEGORIES).default('other'),
  price: z.number().min(0).max(10_000_000),
  negotiable: z.boolean().default(true),
  condition: z.enum(['new', 'like-new', 'good', 'fair']).default('good'),
  images: z.array(z.string().max(500)).max(6).default([]),
});

export const POST = route({ feature: 'marketplace', body: schema, rateLimit: 'post' }, async ({ actor, body }) => {
  if (body.images.some((u) => !container().storage.isOwnUrl(u))) throw ApiError.badRequest('Upload photos here rather than linking them.');
  if ((await Listing.countDocuments({ seller: actor.id, status: 'active' })) >= 20) throw ApiError.unprocessable('You have 20 active listings. Mark some as sold first.');
  const listing = await Listing.create({ ...body, campus: actor.campus, seller: actor.id });
  return created({ listing: { _id: String(listing._id) } });
});
