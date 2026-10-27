import { route, ok } from '@/lib/api/handler';
import { sendVerificationEmail } from '@/server/modules/auth/service';

export const POST = route({ rateLimit: 'otp', allowUnverified: true }, async ({ actor }) => {
  const result = await sendVerificationEmail(actor.id);
  return ok(result);
});
