import { publicRoute, ok } from '@/lib/api/handler';
import { resetPasswordSchema } from '@/lib/validation';
import { resetPassword } from '@/server/modules/auth/service';

export const POST = publicRoute({ body: resetPasswordSchema, rateLimit: 'verify' }, async ({ body }) => {
  await resetPassword(body.email, body.token, body.password);
  return ok({ reset: true });
});
