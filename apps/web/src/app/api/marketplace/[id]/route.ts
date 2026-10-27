import { z } from 'zod';
import { Types } from 'mongoose';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { notify } from '@/lib/notifications';
import Listing from '@/models/campus/Listing';
import { spendCredits } from '@/server/modules/credits/service';
import { listingView } from '@/server/modules/campus-life/listings';

const BOOST_DAYS = 3;

async function load(id: string, campus: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('That listing does not exist.');
  const listing = await Listing.findOne({ _id: id, campus, status: { $ne: 'removed' } });
  if (!listing) throw ApiError.notFound('That listing does not exist.');
  return listing;
}

export const GET = route({ feature: 'marketplace' }, async ({ actor, params }) => {
  const listing = await load(params.id, actor.campus);
  await listing.populate('seller', 'name image batch');
  return ok({ listing: listingView(listing.toObject() as never, actor.id) });
});

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('interested'), interested: z.boolean() }),
  z.object({ action: z.literal('status'), status: z.enum(['active', 'reserved', 'sold', 'removed']) }),
  z.object({ action: z.literal('boost') }),
  z.object({ action: z.literal('edit'), title: z.string().trim().min(3).max(100).optional(), description: z.string().trim().max(2000).optional(), price: z.number().min(0).max(10_000_000).optional(), negotiable: z.boolean().optional() }),
]);

export const POST = route({ feature: 'marketplace', body: schema, rateLimit: 'write' }, async ({ actor, params, body }) => {
  const listing = await load(params.id, actor.campus);
  const isSeller = String(listing.seller) === actor.id;
  switch (body.action) {
    case 'interested': {
      if (isSeller) throw ApiError.badRequest('That is your own listing.');
      const already = listing.interested.some((u) => String(u) === actor.id);
      if (body.interested && !already) {
        await Listing.updateOne({ _id: listing._id }, { $addToSet: { interested: actor.id } });
        await notify({ user: listing.seller, kind: 'marketplace_interest', title: `${actor.name} is interested in “${listing.title}”`, body: 'Message them from the listing to sort out the details.', href: `/marketplace?listing=${listing._id}`, actor: actor.id, entityType: 'Listing', entity: listing._id });
      } else if (!body.interested) await Listing.updateOne({ _id: listing._id }, { $pull: { interested: actor.id } });
      break;
    }
    case 'status':
      if (!isSeller && !actor.canModerate) throw ApiError.forbidden('Only the seller can change this.');
      await Listing.updateOne({ _id: listing._id }, { $set: { status: body.status } });
      break;
    case 'boost': {
      if (!isSeller) throw ApiError.forbidden('Only the seller can boost a listing.');
      if (listing.status !== 'active') throw ApiError.conflict('Only active listings can be boosted.');
      await spendCredits(actor.id, 'listing_boost', String(listing._id));
      const from = listing.boostedUntil && listing.boostedUntil > new Date() ? listing.boostedUntil : new Date();
      await Listing.updateOne({ _id: listing._id }, { $set: { boostedUntil: new Date(from.getTime() + BOOST_DAYS * 86_400_000) } });
      break;
    }
    case 'edit': {
      if (!isSeller) throw ApiError.forbidden('Only the seller can edit this.');
      const { action: _action, ...changes } = body;
      await Listing.updateOne({ _id: listing._id }, { $set: changes });
      break;
    }
  }
  return ok({ ok: true });
});
