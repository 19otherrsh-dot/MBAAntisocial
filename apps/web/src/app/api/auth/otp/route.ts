import { publicRoute, ok } from '@/lib/api/handler';
import { emailOnlySchema } from '@/lib/validation';
import { requestLoginCode } from '@/server/modules/auth/service';

/** Emails a 6-digit sign-in code. Same response whether or not the account exists. */
export const POST = publicRoute({ body: emailOnlySchema, rateLimit: 'otp' }, async ({ body }) => {
  const { devCode } = await requestLoginCode(body.email);
  return ok({ sent: true, ...(devCode ? { devCode } : {}) });
});
