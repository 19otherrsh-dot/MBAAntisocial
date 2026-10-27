import { publicRoute, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { registerSchema } from '@/lib/validation';
import { isEmailDomainAllowed } from '@/lib/env';
import User from '@/models/User';

/**
 * Account creation.
 *
 * Second-years are given the `mentor` role so they can publish availability,
 * but `mentorProfile.acceptingBookings` stays false until they opt in — nobody
 * is enrolled into mentoring by the mere fact of being in year two.
 */
export const POST = publicRoute({ body: registerSchema, rateLimit: 'register' }, async ({ body }) => {
  if (!isEmailDomainAllowed(body.email)) {
    throw ApiError.forbidden(
      'That email domain is not eligible yet. Use your institute address, or ask your campus lead to add it.'
    );
  }

  const existing = await User.exists({ email: body.email });
  if (existing) {
    throw ApiError.conflict('An account with that email already exists. Try signing in.');
  }

  const isSenior = body.year === 2;
  const role = body.isAlumni ? 'alumni' : (isSenior ? 'mentor' : 'student');
  const badges = body.isAlumni ? ['alumni'] : [];

  const user = await User.create({
    name: body.name,
    email: body.email,
    password: body.password, // Hashed by the schema's pre-save hook.
    campus: body.campus,
    batch: body.batch,
    year: body.year,
    role,
    badges,
    mentorProfile: {
      acceptingBookings: false,
      offers: [],
      weeklyCapacity: 3,
      headline: '',
      companies: [],
    },
  });

  return created({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      campus: user.campus,
      role: user.role,
    },
  });
});
