import { publicRoute, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { registerSchema } from '@/lib/validation';
import { env, isEmailDomainAllowed, campusForEmail, isCampusBound } from '@/lib/env';
import { issueToken, VERIFY_EMAIL_TTL_MS } from '@/lib/tokens';
import { sendVerificationEmail } from '@/lib/email';
import User from '@/models/User';

/**
 * Account creation.
 *
 * Second-years are given the `mentor` role so they can publish availability,
 * but `mentorProfile.acceptingBookings` stays false until they opt in — nobody
 * is enrolled into mentoring by the mere fact of being in year two.
 *
 * Campus is the boundary every query in the product is scoped by, so it cannot
 * be something the user merely claims. Where an email domain has been bound to
 * a campus (`CAMPUS_EMAIL_DOMAINS`), the address decides the campus and the
 * address has to be confirmed before the account can sign in.
 */
export const POST = publicRoute({ body: registerSchema, rateLimit: 'register' }, async ({ body }) => {
  if (!isEmailDomainAllowed(body.email)) {
    throw ApiError.forbidden(
      'That email domain is not eligible yet. Use your institute address, or ask your campus lead to add it.'
    );
  }

  const provenCampus = campusForEmail(body.email);
  if (provenCampus && provenCampus !== body.campus) {
    throw ApiError.unprocessable('Some fields need fixing.', {
      campus: `That address belongs to ${provenCampus}. Pick it as your institute.`,
    });
  }
  if (!provenCampus && isCampusBound(body.campus)) {
    throw ApiError.unprocessable('Some fields need fixing.', {
      email: `${body.campus} accounts need an institute email address.`,
    });
  }

  const existing = await User.exists({ email: body.email });
  if (existing) {
    throw ApiError.conflict('An account with that email already exists. Try signing in.');
  }

  const isSenior = body.year === 2;
  const role = body.isAlumni ? 'alumni' : (isSenior ? 'mentor' : 'student');
  const badges = body.isAlumni ? ['alumni'] : [];

  const verification = env.requireEmailVerification ? issueToken(VERIFY_EMAIL_TTL_MS) : null;

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
    ...(verification
      ? { emailVerification: { tokenHash: verification.tokenHash, expiresAt: verification.expiresAt } }
      : {}),
  });

  if (verification) await sendVerificationEmail(user.email, user.name, verification.raw);

  return created({
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      campus: user.campus,
      role: user.role,
    },
    verificationRequired: Boolean(verification),
  });
});
