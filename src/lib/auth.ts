import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import connectDB from './mongodb';
import User from '@/models/User';
import { authConfig } from './auth.config';
import { env } from './env';

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
     * Extends the edge-safe callback with a database refresh.
     *
     * `useSession().update()` re-reads the user's durable fields from the
     * database. Whatever the client passes to `update()` is ignored entirely:
     * the token only ever carries values this server looked up itself.
     */
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);

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

