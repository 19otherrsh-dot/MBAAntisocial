import { route, ok } from '@/lib/api/handler';
import { acceptHonorCodeSchema } from '@/lib/validation';
import User from '@/models/User';

/**
 * Records acceptance of the resource-sharing policy (§6.5).
 *
 * The resource module refuses uploads until this exists, so the guardrail is a
 * precondition in code rather than a paragraph on a page nobody reads.
 */
export const POST = route(
  { body: acceptHonorCodeSchema, rateLimit: 'write' },
  async ({ actor }) => {
    const acceptedAt = new Date();
    await User.updateOne({ _id: actor.id }, { $set: { honorCodeAcceptedAt: acceptedAt } });
    return ok({ honorCodeAcceptedAt: acceptedAt });
  }
);
