import { publicRoute, created } from '@/lib/api/handler';
import { registerSchema } from '@/lib/validation';
import { registerWithPassword } from '@/server/modules/auth/service';
import { container } from '@/server/container';

/**
 * Account creation with a password. The campus is derived from the email —
 * never chosen from a list — so nobody can sign up into a batch they are not in.
 *
 * Second-years are given the `mentor` role so they can publish availability,
 * but `mentorProfile.acceptingBookings` stays false until they opt in.
 */
export const POST = publicRoute({ body: registerSchema, rateLimit: 'register' }, async ({ body }) => {
  const { user, campusStatus, devLink } = await registerWithPassword(body);
  return created({
    user: { id: user._id.toString(), name: user.name, email: user.email, campus: user.campus, role: user.role },
    campusStatus,
    /** Tells the client whether a real email went out or it was logged (dev). */
    emailDelivered: container().email.delivers,
    ...(devLink ? { devLink } : {}),
  });
});
