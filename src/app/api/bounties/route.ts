import { Types } from 'mongoose';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import connectDB from '@/lib/mongodb';
import Bounty from '@/models/Bounty';
import { createBountySchema, claimBountySchema } from '@/lib/validation';

export const GET = route({}, async ({ actor }) => {
  await connectDB();

  // Fetch all open bounties (and recently filled ones) for the campus
  const bounties = await Bounty.find({ campus: actor.campus })
    .populate('owner', 'name image')
    .populate('slotsFilled', 'name image')
    .sort({ status: -1, createdAt: -1 }) // Open first, then by date
    .limit(50)
    .lean();

  return ok({ bounties });
});

export const POST = route({}, async ({ request, actor }) => {
  await connectDB();
  const body = await request.json();
  const parsed = createBountySchema.safeParse(body);

  if (!parsed.success) {
    throw ApiError.badRequest('Invalid bounty data', parsed.error.issues);
  }

  const bounty = await Bounty.create({
    ...parsed.data,
    owner: actor.id,
    campus: actor.campus,
    slotsFilled: [actor.id], // Owner automatically takes one slot
  });

  return ok({ bounty });
});

export const PATCH = route({}, async ({ request, actor }) => {
  await connectDB();
  const body = await request.json();
  const parsed = claimBountySchema.safeParse(body);

  if (!parsed.success) {
    throw ApiError.badRequest('Invalid claim data', parsed.error.issues);
  }

  const bounty = await Bounty.findOne({ _id: parsed.data.bountyId, campus: actor.campus });
  
  if (!bounty) {
    throw ApiError.notFound('Bounty not found.');
  }

  if (bounty.status === 'filled') {
    throw ApiError.badRequest('This syndicate is already full.');
  }

  // Compared as strings: `slotsFilled` holds ObjectIds, and `includes` on them
  // against a string id is always false, which would let one person join twice.
  if (bounty.slotsFilled.some((id) => String(id) === actor.id)) {
    throw ApiError.badRequest('You are already part of this syndicate.');
  }

  bounty.slotsFilled.push(new Types.ObjectId(actor.id));

  if (bounty.slotsFilled.length >= bounty.slotsRequired) {
    bounty.status = 'filled';
  }

  await bounty.save();

  return ok({ bounty });
});
