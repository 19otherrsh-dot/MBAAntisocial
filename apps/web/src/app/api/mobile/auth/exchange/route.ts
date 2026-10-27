import { publicRoute, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { handoffSchema } from '@/lib/validation';
import { issueAccessToken, loadSessionUser, redeemHandoffCode } from '@/server/modules/auth/service';

/** Swaps a one-time code from the SSO deep link for a bearer token. */
export const POST = publicRoute({ body: handoffSchema, rateLimit: 'login' }, async ({ body }) => {
  const userId = await redeemHandoffCode(body.code, 'to_app');
  const user = userId ? await loadSessionUser(userId) : null;
  if (!user) throw ApiError.unauthorized('That sign-in link expired. Try again.');
  return ok({ token: await issueAccessToken(user), user });
});
