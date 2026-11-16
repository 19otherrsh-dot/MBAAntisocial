import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import Bounty from '@/models/Bounty';
import { createBountySchema, claimBountySchema } from '@/lib/validation';

const PERSON_FIELDS = 'name image';

/** Cost splits — a subscription, a cab to the airport, a fest ticket block. */
export const GET = route({}, async ({ actor }) => {
  const bounties = await Bounty.find({ campus: actor.campus })
    .populate('owner', PERSON_FIELDS)
    .populate('slotsFilled', PERSON_FIELDS)
    // 'open' sorts after 'filled' alphabetically, so descending puts open first.
    .sort({ status: -1, createdAt: -1 })
    .limit(50)
    .lean();

  return ok({ bounties });
});

// Validation and throttling go through the wrapper, like every other write.
export const POST = route(
  { body: createBountySchema, rateLimit: 'post' },
  async ({ actor, body }) => {
    const bounty = await Bounty.create({
      ...body,
      owner: actor.id,
      campus: actor.campus,
      slotsFilled: [actor.id], // The proposer takes the first slot.
    });

    return created({ bounty });
  }
);

export const PATCH = route(
  { body: claimBountySchema, rateLimit: 'write' },
  async ({ actor, body }) => {
    /*
     * One conditional update, not read-check-save. The old version loaded the
     * document, checked for room, pushed, and saved — so two people claiming
     * the last slot at the same moment both passed the check and both got in.
     * Here the "is there room, and am I not already in" test is part of the
     * write itself, and the database applies it to one caller at a time.
     */
    const updated = await Bounty.findOneAndUpdate(
      {
        _id: body.bountyId,
        campus: actor.campus,
        status: 'open',
        slotsFilled: { $ne: actor.id },
        $expr: { $lt: [{ $size: '$slotsFilled' }, '$slotsRequired'] },
      },
      [
        { $set: { slotsFilled: { $concatArrays: ['$slotsFilled', [{ $toObjectId: actor.id }]] } } },
        {
          $set: {
            status: {
              $cond: [{ $gte: [{ $size: '$slotsFilled' }, '$slotsRequired'] }, 'filled', 'open'],
            },
          },
        },
      ],
      { new: true, updatePipeline: true }
    )
      .populate('owner', PERSON_FIELDS)
      .populate('slotsFilled', PERSON_FIELDS)
      .lean();

    if (updated) return ok({ bounty: updated });

    // Nothing matched — work out which reason to report.
    const bounty = await Bounty.findOne({ _id: body.bountyId, campus: actor.campus })
      .select('status slotsFilled')
      .lean();
    if (!bounty) throw ApiError.notFound('That split no longer exists.');
    if (bounty.slotsFilled.some((id) => String(id) === actor.id)) {
      throw ApiError.conflict('You are already in this split.');
    }
    throw ApiError.conflict('That split just filled up.');
  }
);
