import { publicRoute, ok } from '@/lib/api/handler';
import { verifyEmailSchema } from '@/lib/validation';
import { verifyEmailToken } from '@/server/modules/auth/service';

export const POST = publicRoute({ body: verifyEmailSchema, rateLimit: 'verify' }, async ({ body }) => {
  const user = await verifyEmailToken(body.email, body.token);
  return ok({ verified: Boolean(user?.emailVerifiedAt) });
});
