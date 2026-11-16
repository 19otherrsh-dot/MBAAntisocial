import { publicRoute, ok } from '@/lib/api/handler';
import { emailOnlySchema } from '@/lib/validation';
import { issueToken, VERIFY_EMAIL_TTL_MS } from '@/lib/tokens';
import { sendVerificationEmail } from '@/lib/email';
import User from '@/models/User';

/**
 * Re-sends the confirmation link.
 *
 * Answers identically whether or not the address has an account, or is already
 * confirmed — otherwise this endpoint is a way to check who is registered.
 */
export const POST = publicRoute({ body: emailOnlySchema, rateLimit: 'authEmail' }, async ({ body }) => {
  const user = await User.findOne({ email: body.email, emailVerifiedAt: { $exists: false } })
    .select('name email +emailVerification')
    .lean();

  // Only accounts that are actually waiting on a confirmation get a new link.
  if (user?.emailVerification) {
    const token = issueToken(VERIFY_EMAIL_TTL_MS);
    await User.updateOne(
      { _id: user._id },
      { $set: { emailVerification: { tokenHash: token.tokenHash, expiresAt: token.expiresAt } } }
    );
    await sendVerificationEmail(user.email, user.name, token.raw);
  }

  return ok({ sent: true });
});
