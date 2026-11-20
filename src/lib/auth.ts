import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import connectDB from './mongodb';
import User from '@/models/User';
import { authConfig } from './auth.config';
import { env, campusForEmail } from './env';
import { ssoProviders, decideSsoSignIn, providerVerifiedEmail } from './sso';
import { getBatchOptions } from './constants';
import { recordAudit } from './audit';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/*
 * Distinct, non-enumerating failure codes. Both are only ever raised *after*
 * the password has matched, so they tell an attacker nothing they could not
 * already see by signing in.
 */
class UnverifiedEmailError extends CredentialsSignin {
  code = 'unverified';
}

class SuspendedError extends CredentialsSignin {
  code = 'suspended';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,

    /**
     * Gate for every sign-in. Passwords are checked in `authorize` below; this
     * handles single sign-on, where the provider has already authenticated the
     * person and the question is whether *we* let them in, and as whom.
     */
    async signIn({ account, profile, user }) {
      if (!account || account.provider === 'credentials') return true;

      await connectDB();
      const email = (user.email ?? (profile?.email as string | undefined) ?? '').toLowerCase();
      const existing = email
        ? await User.findOne({ email }).select('_id suspendedAt linkedAccounts').lean()
        : null;

      const decision = decideSsoSignIn({
        provider: account.provider,
        email,
        emailVerified: providerVerifiedEmail(account.provider, profile as Record<string, unknown> | undefined),
        boundCampus: email ? campusForEmail(email) : null,
        existing: existing ? { id: String(existing._id), suspended: Boolean(existing.suspendedAt) } : null,
      });

      // Auth.js turns a returned path into a redirect, with the reason shown
      // on the sign-in page.
      if (!decision.allow) return `/login?error=sso_${decision.reason}`;

      const link = { provider: account.provider, providerAccountId: account.providerAccountId, linkedAt: new Date() };

      if (decision.action === 'link') {
        // Remembered once per provider. The provider has verified the address,
        // so it also counts as a confirmed email.
        await User.updateOne(
          { _id: decision.userId, 'linkedAccounts.provider': { $ne: account.provider } },
          { $push: { linkedAccounts: link } }
        );
        await User.updateOne(
          { _id: decision.userId, emailVerifiedAt: { $exists: false } },
          { $set: { emailVerifiedAt: new Date() }, $unset: { emailVerification: 1 } }
        );
        return true;
      }

      // First sign-in: provision. Year and batch are confirmed in onboarding.
      const created = await User.create({
        name: displayName(user.name, email),
        email,
        image: user.image ?? '',
        campus: decision.campus,
        batch: getBatchOptions()[1],
        year: 1,
        role: 'student',
        emailVerifiedAt: new Date(),
        linkedAccounts: [link],
        mentorProfile: { acceptingBookings: false, offers: [], weeklyCapacity: 3, headline: '', companies: [] },
      });
      await recordAudit({
        actor: { id: String(created._id), campus: decision.campus },
        action: 'account.provisioned_sso',
        target: { type: 'user', id: String(created._id) },
        detail: { provider: account.provider },
      });
      return true;
    },

    /**
     * Extends the edge-safe callback with a database refresh.
     *
     * `useSession().update()` re-reads the user's durable fields from the
     * database. Whatever the client passes to `update()` is ignored entirely:
     * the token only ever carries values this server looked up itself.
     */
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);

      // After single sign-on, `user` is the provider's view of the person. The
      // token must carry *our* account, so it is looked up by the (verified,
      // already-checked) email.
      if (params.account && params.account.provider !== 'credentials' && token.email) {
        await connectDB();
        const own = await User.findOne({ email: token.email.toLowerCase() })
          .select('campus batch year role onboardedAt name image')
          .lean();
        if (own) {
          token.id = String(own._id);
          token.sub = String(own._id);
          token.campus = own.campus;
          token.batch = own.batch;
          token.year = own.year;
          token.role = own.role;
          token.onboardedAt = own.onboardedAt?.toISOString() ?? null;
          token.name = own.name;
        }
      }

      if (params.trigger === 'update' && token.id) {
        await connectDB();
        const fresh = await User.findById(token.id)
          .select('campus batch year role onboardedAt')
          .lean();
        if (fresh) {
          token.campus = fresh.campus;
          token.batch = fresh.batch;
          token.year = fresh.year;
          token.role = fresh.role;
          token.onboardedAt = fresh.onboardedAt?.toISOString() ?? null;
        }
      }

      return token;
    },
  },
  providers: [
    ...ssoProviders(),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        // Returning null yields a generic CredentialsSignin error, which is
        // what we want — a distinct "no such account" message would let anyone
        // enumerate which addresses are registered.
        if (!parsed.success) return null;

        await connectDB();

        const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select(
          '+password +emailVerification'
        );
        if (!user?.password) return null;

        const isMatch = await user.comparePassword(parsed.data.password);
        if (!isMatch) return null;

        if (user.suspendedAt) throw new SuspendedError();

        /*
         * Only accounts created with a pending confirmation are held back.
         * Accounts that predate verification have neither field and are let
         * through, so turning email on does not lock out an existing batch.
         */
        if (env.requireEmailVerification && !user.emailVerifiedAt && user.emailVerification) {
          throw new UnverifiedEmailError();
        }

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
        };
      },
    }),
  ],
});


/** A usable display name: the provider's, else the address's local part, else a placeholder. */
function displayName(fromProvider: string | null | undefined, email: string): string {
  const candidate = (fromProvider ?? '').trim() || email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return candidate.length >= 2 ? candidate.slice(0, 80) : 'New member';
}
