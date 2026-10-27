import { SignJWT, jwtVerify } from 'jose';
import { getBatchOptions, type UserRole } from '@/lib/constants';
import { env } from '@/lib/env';
import User, { type IUser } from '@/models/User';
import VerificationToken, { type TokenPurpose } from '@/models/VerificationToken';
import { ApiError } from '@/lib/api/errors';
import { container } from '../../container';
import { hashToken, numericCode, randomToken } from '../../crypto';
import * as emails from '../../emails/templates';
import { maybeUnlockCampus, requestCampus, resolveEmail } from '../campus/service';

/**
 * Identity: every way of proving who you are, all funnelling into one rule —
 * an official institute email decides your campus.
 */

/** What goes on the session/JWT. Durable identity only; live counters come from /api/me. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  campus: string;
  batch: string;
  year: 1 | 2;
  role: UserRole;
  onboardedAt: string | null;
  verified: boolean;
}

export function toSessionUser(user: Pick<IUser, '_id' | 'name' | 'email' | 'image' | 'campus' | 'batch' | 'year' | 'role' | 'onboardedAt' | 'emailVerifiedAt'>): SessionUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    image: user.image || null,
    campus: user.campus,
    batch: user.batch,
    year: user.year,
    role: user.role,
    onboardedAt: user.onboardedAt?.toISOString() ?? null,
    verified: Boolean(user.emailVerifiedAt),
  };
}

const TTL = {
  verify_email: 24 * 60 * 60,
  reset_password: 30 * 60,
  login_code: 10 * 60,
} satisfies Record<TokenPurpose, number>;

const MAX_CODE_ATTEMPTS = 5;

async function issueToken(purpose: TokenPurpose, email: string, userId: string | undefined, secret: string) {
  // One live token per purpose: issuing a new one revokes the old.
  await VerificationToken.deleteMany({ email, purpose, consumedAt: { $exists: false } });
  await VerificationToken.create({
    email,
    user: userId,
    purpose,
    tokenHash: hashToken(`${purpose}:${email}:${secret}`),
    expiresAt: new Date(Date.now() + TTL[purpose] * 1000),
  });
}

/** Grants `admin` to addresses listed in PLATFORM_ADMIN_EMAILS. */
function bootstrapRole(email: string, role: UserRole): UserRole {
  return env.platformAdminEmails.includes(email.toLowerCase()) ? 'admin' : role;
}

/* ───────────────────────── Registration ───────────────────────── */

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  batch: string;
  year: 1 | 2;
  isAlumni: boolean;
  /** Only needed when the domain is not yet a known campus. */
  institutionName?: string;
}

export async function registerWithPassword(input: RegisterInput) {
  const email = input.email.toLowerCase();
  const resolution = await resolveEmail(email);

  let campusName: string;
  if (resolution.kind === 'blocked') throw ApiError.forbidden(resolution.reason);
  if (resolution.kind === 'member') {
    campusName = resolution.campus.name;
  } else {
    if (!input.institutionName?.trim()) {
      throw ApiError.unprocessable('Tell us your institute’s name so we can set it up.', {
        institutionName: 'We do not know this institute yet — enter its full name.',
      });
    }
    const campus = await requestCampus({ name: input.institutionName.trim(), domain: resolution.domain });
    campusName = campus.name;
  }

  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with that email already exists. Try signing in.');
  }

  const role: UserRole = input.isAlumni ? 'alumni' : input.year === 2 ? 'mentor' : 'student';
  const user = await User.create({
    name: input.name,
    email,
    password: input.password,
    campus: campusName,
    batch: input.batch,
    year: input.year,
    role: bootstrapRole(email, role),
    badges: input.isAlumni ? ['alumni'] : [],
    authProviders: ['password'],
  });

  const verification = await sendVerificationEmail(user._id.toString());
  return {
    user,
    campusStatus: resolution.kind === 'member' ? resolution.campus.status : 'requested',
    devLink: verification.devLink,
  };
}

/* ───────────────────────── Email verification ───────────────────────── */

export async function sendVerificationEmail(userId: string) {
  const user = await User.findById(userId).select('name email emailVerifiedAt');
  if (!user || user.emailVerifiedAt) return { sent: false };
  const secret = randomToken();
  await issueToken('verify_email', user.email, userId, secret);
  const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(secret)}&email=${encodeURIComponent(user.email)}`;
  await container().email.send({ to: user.email, ...emails.verifyEmail(user.name, url), idempotencyKey: `verify:${hashToken(secret)}` });
  return { sent: true, devLink: container().email.delivers ? undefined : url };
}

export async function verifyEmailToken(email: string, secret: string) {
  const normalised = email.toLowerCase();
  const token = await VerificationToken.findOneAndUpdate(
    {
      purpose: 'verify_email',
      tokenHash: hashToken(`verify_email:${normalised}:${secret}`),
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } }
  );
  if (!token) throw ApiError.badRequest('That link has expired or was already used. Request a new one.');
  return markVerified(normalised);
}

async function markVerified(email: string) {
  const user = await User.findOneAndUpdate(
    { email, emailVerifiedAt: { $exists: false } },
    { $set: { emailVerifiedAt: new Date() } },
    { new: true }
  );
  if (user) await maybeUnlockCampus(user.campus).catch(() => false);
  return user ?? (await User.findOne({ email }));
}

/* ───────────────────────── Password reset ───────────────────────── */

/** Always resolves the same way, so it cannot be used to discover accounts. */
export async function requestPasswordReset(email: string) {
  const normalised = email.toLowerCase();
  const user = await User.findOne({ email: normalised }).select('_id email');
  if (!user) return { devLink: undefined };
  const secret = randomToken();
  await issueToken('reset_password', normalised, user._id.toString(), secret);
  const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(secret)}&email=${encodeURIComponent(normalised)}`;
  await container().email.send({ to: normalised, ...emails.resetPassword(url) });
  return { devLink: container().email.delivers ? undefined : url };
}

export async function resetPassword(email: string, secret: string, password: string) {
  const normalised = email.toLowerCase();
  const token = await VerificationToken.findOneAndUpdate(
    {
      purpose: 'reset_password',
      tokenHash: hashToken(`reset_password:${normalised}:${secret}`),
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } }
  );
  if (!token) throw ApiError.badRequest('That reset link has expired or was already used.');

  const user = await User.findOne({ email: normalised }).select('+password');
  if (!user) throw ApiError.badRequest('That reset link has expired or was already used.');
  user.password = password;
  // Proving control of the inbox also proves the address.
  if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
  if (!user.authProviders.includes('password')) user.authProviders.push('password');
  await user.save();
}

/* ───────────────────────── One-time sign-in codes ───────────────────────── */

export async function requestLoginCode(email: string) {
  const normalised = email.toLowerCase();
  const user = await User.findOne({ email: normalised }).select('_id suspendedAt');
  // Same response either way; only real, active accounts get a code.
  if (!user || user.suspendedAt) return { devCode: undefined };
  const code = numericCode(6);
  await issueToken('login_code', normalised, user._id.toString(), code);
  await container().email.send({ to: normalised, ...emails.loginCode(code) });
  return { devCode: container().email.delivers ? undefined : code };
}

/**
 * Checks a code. Wrong guesses count against the live token and burn it after
 * five, so a six-digit code cannot be brute-forced inside its ten minutes.
 */
export async function verifyLoginCode(email: string, code: string) {
  const normalised = email.toLowerCase();
  const token = await VerificationToken.findOne({
    email: normalised,
    purpose: 'login_code',
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
  if (!token) return null;

  if (token.tokenHash !== hashToken(`login_code:${normalised}:${code}`)) {
    token.attempts += 1;
    if (token.attempts >= MAX_CODE_ATTEMPTS) token.consumedAt = new Date();
    await token.save();
    return null;
  }

  token.consumedAt = new Date();
  await token.save();

  const user = await markVerified(normalised);
  if (user && !user.authProviders.includes('otp')) {
    await User.updateOne({ _id: user._id }, { $addToSet: { authProviders: 'otp' } });
  }
  return user;
}

/* ───────────────────────── SSO ───────────────────────── */

export interface SsoProfile {
  provider: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
}

export class SsoRejected extends Error {
  constructor(readonly code: 'unverified' | 'domain' | 'suspended', message: string) {
    super(message);
  }
}

/**
 * Signs in or provisions an SSO user. The identity provider vouches for the
 * address, so it counts as verified — but only an official institute address
 * is accepted, whichever provider it arrives from (LinkedIn included).
 */
export async function provisionSsoUser(profile: SsoProfile) {
  const email = profile.email.toLowerCase();
  if (!profile.emailVerified) {
    throw new SsoRejected('unverified', 'Your provider has not verified that email address.');
  }

  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.suspendedAt) throw new SsoRejected('suspended', 'This account is suspended.');
    const update: Record<string, unknown> = {};
    if (!existing.emailVerifiedAt) update.emailVerifiedAt = new Date();
    if (!existing.image && profile.image) update.image = profile.image;
    await User.updateOne({ _id: existing._id }, { $set: update, $addToSet: { authProviders: profile.provider } });
    if (update.emailVerifiedAt) await maybeUnlockCampus(existing.campus).catch(() => false);
    return User.findById(existing._id);
  }

  const resolution = await resolveEmail(email);
  if (resolution.kind === 'blocked') throw new SsoRejected('domain', resolution.reason);

  const campusName =
    resolution.kind === 'member'
      ? resolution.campus.name
      : (await requestCampus({ name: resolution.suggestedName, domain: resolution.domain })).name;

  // Batch and year are unknown until onboarding; `onboardedAt` stays empty so
  // the app routes them there first.
  const user = await User.create({
    name: profile.name || email.split('@')[0],
    email,
    image: profile.image ?? '',
    campus: campusName,
    batch: getBatchOptions()[1],
    year: 1,
    role: bootstrapRole(email, 'student'),
    authProviders: [profile.provider],
    emailVerifiedAt: new Date(),
  });
  await maybeUnlockCampus(campusName).catch(() => false);
  return user;
}

/* ───────────────────────── Native app tokens ───────────────────────── */

const MOBILE_TOKEN_TTL = '30d';
const mobileKey = () => new TextEncoder().encode(`${env.AUTH_SECRET}:mobile-access`);

/** Bearer token for the native apps. Same identity claims as the web session. */
export async function issueAccessToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user, use: 'mobile' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(MOBILE_TOKEN_TTL)
    .sign(mobileKey());
}

export async function verifyAccessToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, mobileKey(), { algorithms: ['HS256'] });
    if (payload.use !== 'mobile' || typeof payload.sub !== 'string') return null;
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

/**
 * One-time handoff codes bridge the two auth worlds: the web finishes an SSO
 * flow and hands the app a code (deep link), or the app hands its WebView a
 * code to open a cookie session. Each code works once, for sixty seconds.
 */
export async function issueHandoffCode(userId: string, direction: 'to_app' | 'to_web'): Promise<string> {
  const code = randomToken(24);
  await container().kv.set(`handoff:${direction}:${code}`, userId, 60);
  return code;
}

export async function redeemHandoffCode(code: string, direction: 'to_app' | 'to_web'): Promise<string | null> {
  return container().kv.take(`handoff:${direction}:${code}`);
}

export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await User.findById(userId).select('name email image campus batch year role onboardedAt emailVerifiedAt suspendedAt');
  if (!user || user.suspendedAt) return null;
  return toSessionUser(user);
}
