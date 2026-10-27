import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import LinkedIn from 'next-auth/providers/linkedin';
import { z } from 'zod';
import connectDB from './mongodb';
import { env } from './env';
import User from '@/models/User';
import { authConfig } from './auth.config';
import {
  provisionSsoUser,
  SsoRejected,
  toSessionUser,
  verifyLoginCode,
} from '@/server/modules/auth/service';

const passwordSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const otpSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

/**
 * Sign-in providers. Password and one-time code are always on; each SSO
 * provider switches on when its keys are configured. All of them resolve to an
 * email, and only an official institute email gets in (see `campus/service`).
 */
const providers: NextAuthConfig['providers'] = [
  Credentials({
    id: 'credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      const parsed = passwordSchema.safeParse(credentials);
      // Returning null yields a generic CredentialsSignin error, which is what
      // we want — a distinct "no such account" message would let anyone
      // enumerate which addresses are registered.
      if (!parsed.success) return null;

      await connectDB();
      const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select('+password');
      if (!user?.password) return null;
      if (!(await user.comparePassword(parsed.data.password))) return null;
      if (user.suspendedAt) throw new Error('This account is suspended. Contact your campus moderator.');

      return toSessionUser(user);
    },
  }),
  Credentials({
    id: 'otp',
    credentials: {
      email: { label: 'Email', type: 'email' },
      code: { label: 'Code', type: 'text' },
    },
    async authorize(credentials) {
      const parsed = otpSchema.safeParse(credentials);
      if (!parsed.success) return null;
      await connectDB();
      const user = await verifyLoginCode(parsed.data.email, parsed.data.code);
      if (!user || user.suspendedAt) return null;
      return toSessionUser(user);
    },
  }),
];

if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }));
}
if (env.AUTH_MICROSOFT_ENTRA_ID_ID && env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
  providers.push(
    MicrosoftEntraID({
      clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    })
  );
}
if (env.AUTH_LINKEDIN_ID && env.AUTH_LINKEDIN_SECRET) {
  providers.push(LinkedIn({ clientId: env.AUTH_LINKEDIN_ID, clientSecret: env.AUTH_LINKEDIN_SECRET }));
}

/** Provider ids shown on the sign-in screen. */
export const ssoProviders = providers
  .map((p) => (typeof p === 'function' ? p() : p))
  .filter((p) => p.type === 'oidc' || p.type === 'oauth')
  .map((p) => ({ id: p.id, name: p.name }));

/**
 * Whether the identity provider vouches for the email. Microsoft Entra lets a
 * tenant admin set an arbitrary, unverified `email` claim (the "nOAuth" class
 * of account takeover), so it is trusted only when Microsoft marks the domain
 * owner-verified or it matches the tenant-verified UPN.
 */
function emailVerifiedBy(provider: string, profile: Record<string, unknown> | undefined, email: string): boolean {
  if (!profile) return false;
  if (provider === 'microsoft-entra-id') {
    const upn = typeof profile.preferred_username === 'string' ? profile.preferred_username.toLowerCase() : '';
    return profile.xms_edov === true || profile.xms_edov === '1' || upn === email.toLowerCase();
  }
  return profile.email_verified === true || profile.email_verified === 'true';
}

function isCredentialsProvider(provider: string | undefined) {
  return provider === 'credentials' || provider === 'otp';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user, account, profile }) {
      if (!account || isCredentialsProvider(account.provider)) return true;

      const email = (user.email ?? (profile?.email as string | undefined) ?? '').toLowerCase();
      if (!email) return '/login?error=sso_no_email';

      await connectDB();
      try {
        await provisionSsoUser({
          provider: account.provider,
          email,
          emailVerified: emailVerifiedBy(account.provider, profile as Record<string, unknown> | undefined, email),
          name: user.name ?? '',
          image: user.image,
        });
        return true;
      } catch (error) {
        if (error instanceof SsoRejected) return `/login?error=sso_${error.code}`;
        throw error;
      }
    },

    /**
     * For SSO sign-ins `user` is the provider profile, not our record, so the
     * token is filled from the database before the shared callback runs.
     */
    async jwt(params) {
      if (params.account && params.user && !isCredentialsProvider(params.account.provider)) {
        await connectDB();
        const record = await User.findOne({ email: (params.user.email ?? '').toLowerCase() });
        if (record) params.user = { ...toSessionUser(record) };
      }
      return authConfig.callbacks.jwt(params);
    },
  },
});
