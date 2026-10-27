import { publicRoute, ok } from '@/lib/api/handler';
import { emailOnlySchema } from '@/lib/validation';
import { resolveEmail } from '@/server/modules/campus/service';

/**
 * Tells the sign-up form which campus an address belongs to, before the person
 * fills anything else in. Reveals only what the domain list already implies.
 */
export const POST = publicRoute({ body: emailOnlySchema, rateLimit: 'verify' }, async ({ body }) => {
  return ok({ resolution: await resolveEmail(body.email) });
});
