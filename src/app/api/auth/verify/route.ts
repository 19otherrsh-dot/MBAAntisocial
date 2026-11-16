import { publicRoute, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { verifyEmailSchema } from '@/lib/validation';
import { hashToken } from '@/lib/tokens';
import User from '@/models/User';

/** Confirms an address from the emailed link. Single use. */
export const POST = publicRoute({ body: verifyEmailSchema, rateLimit: 'login' }, async ({ body }) => {
  const user = await User.findOneAndUpdate(
    {
      'emailVerification.tokenHash': hashToken(body.token),
      'emailVerification.expiresAt': { $gt: new Date() },
    },
    { $set: { emailVerifiedAt: new Date() }, $unset: { emailVerification: 1 } },
    { new: true }
  )
    .select('email')
    .lean();

  if (!user) {
    throw ApiError.badRequest('That link has expired or was already used. Ask for a fresh one.');
  }

  return ok({ verified: true, email: user.email });
});
