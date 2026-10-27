import { publicRoute, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { mobileLoginSchema } from '@/lib/validation';
import User from '@/models/User';
import { issueAccessToken, toSessionUser, verifyLoginCode } from '@/server/modules/auth/service';

/** Native-app sign-in with a password or an emailed code. Returns a bearer token. */
export const POST = publicRoute({ body: mobileLoginSchema, rateLimit: 'login' }, async ({ body }) => {
  let user;
  if ('password' in body) {
    const found = await User.findOne({ email: body.email }).select('+password');
    if (found?.password && (await found.comparePassword(body.password))) user = found;
  } else {
    user = await verifyLoginCode(body.email, body.code);
  }
  if (!user) throw ApiError.unauthorized('That did not work. Check the details and try again.');
  if (user.suspendedAt) throw ApiError.forbidden('This account is suspended.');

  const sessionUser = toSessionUser(user);
  return ok({ token: await issueAccessToken(sessionUser), user: sessionUser });
});
