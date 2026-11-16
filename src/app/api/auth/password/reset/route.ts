import { publicRoute, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { resetPasswordSchema } from '@/lib/validation';
import { hashToken } from '@/lib/tokens';
import User from '@/models/User';

/**
 * Completes a password reset from the emailed link.
 *
 * Setting `passwordChangedAt` is what signs out every existing session: the
 * route wrapper refuses any token established before it. Following the link
 * also proves ownership of the address, so it counts as confirming it.
 */
export const POST = publicRoute({ body: resetPasswordSchema, rateLimit: 'login' }, async ({ body }) => {
  const user = await User.findOne({
    'passwordReset.tokenHash': hashToken(body.token),
    'passwordReset.expiresAt': { $gt: new Date() },
  }).select('+passwordReset +emailVerification');

  if (!user) {
    throw ApiError.badRequest('That link has expired or was already used. Ask for a fresh one.');
  }

  user.password = body.password; // Hashed by the pre-save hook.
  user.passwordChangedAt = new Date();
  user.passwordReset = undefined;
  user.emailVerification = undefined;
  user.emailVerifiedAt ??= new Date();
  await user.save();

  return ok({ reset: true });
});
