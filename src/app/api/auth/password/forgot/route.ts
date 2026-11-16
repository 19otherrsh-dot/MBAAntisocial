import { publicRoute, ok } from '@/lib/api/handler';
import { emailOnlySchema } from '@/lib/validation';
import { issueToken, PASSWORD_RESET_TTL_MS } from '@/lib/tokens';
import { sendPasswordResetEmail } from '@/lib/email';
import User from '@/models/User';

/**
 * Starts a password reset.
 *
 * The response never reveals whether the address is registered: the same body
 * comes back either way, and the email is the only place the answer appears.
 */
export const POST = publicRoute({ body: emailOnlySchema, rateLimit: 'authEmail' }, async ({ body }) => {
  const user = await User.findOne({ email: body.email, suspendedAt: { $exists: false } })
    .select('name email')
    .lean();

  if (user) {
    const token = issueToken(PASSWORD_RESET_TTL_MS);
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordReset: { tokenHash: token.tokenHash, expiresAt: token.expiresAt } } }
    );
    await sendPasswordResetEmail(user.email, user.name, token.raw);
  }

  return ok({ sent: true });
});
