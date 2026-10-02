import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import connectDB from './mongodb';
import User from '@/models/User';
import { authConfig } from './auth.config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
          '+password'
        );
        if (!user?.password) return null;

        const isMatch = await user.comparePassword(parsed.data.password);
        if (!isMatch) return null;

        if (user.suspendedAt) {
          throw new Error('This account is suspended. Contact your campus moderator.');
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
