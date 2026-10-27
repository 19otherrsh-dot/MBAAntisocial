import { publicRoute, ok } from '@/lib/api/handler';
import { emailOnlySchema } from '@/lib/validation';
import { requestPasswordReset } from '@/server/modules/auth/service';

/** Always 200 with the same body, whether or not the account exists. */
export const POST = publicRoute({ body: emailOnlySchema, rateLimit: 'otp' }, async ({ body }) => {
  const { devLink } = await requestPasswordReset(body.email);
  return ok({ sent: true, ...(devLink ? { devLink } : {}) });
});
