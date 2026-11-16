import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe half of the auth configuration.
 *
 * Middleware runs on the edge runtime, where Mongoose cannot load. Keeping the
 * session/JWT callbacks and route rules here — with no provider that touches
 * the database — lets middleware evaluate a session without pulling the driver
 * into the edge bundle. `auth.ts` extends this with the Credentials provider
 * for the Node.js runtime.
 */

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/offline',
];

/** Auth screens a signed-in user has no reason to be on. */
const SIGNED_OUT_ONLY = ['/login', '/register', '/forgot-password'];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return pathname.startsWith('/legal/');
}

export const authConfig = {
  providers: [], // Populated in auth.ts — middleware never needs to authorize.
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    /**
     * Copies durable identity onto the token at sign-in.
     *
     * Deliberately excludes points, karma, and streak. A JWT is only reissued
     * on sign-in, so any counter stored here would be frozen at whatever it was
     * the day the user logged in. Live figures come from `/api/me` instead.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.sub ?? '';
        token.campus = user.campus ?? '';
        token.batch = user.batch ?? '';
        token.year = user.year ?? 1;
        token.role = user.role ?? 'student';
        token.onboardedAt = user.onboardedAt ?? null;
        token.authAt = Date.now();
      }

      /*
       * Nothing here reads the `session` argument of an `update` trigger. That
       * value is whatever the browser chose to POST, so copying `role` or
       * `campus` from it let any signed-in user promote themselves to admin of
       * any campus with a single request. A refresh re-reads the database
       * instead — see the `jwt` override in `auth.ts`, which is the only place
       * with a database to read.
       */
      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.campus = token.campus;
        session.user.batch = token.batch;
        session.user.year = token.year;
        session.user.role = token.role;
        session.user.onboardedAt = token.onboardedAt;
        session.user.authAt = token.authAt ?? 0;
      }
      return session;
    },

    /**
     * Server-side route protection. The dashboard previously guarded itself in
     * a client `useEffect`, which renders the shell before redirecting and is
     * not enforcement at all.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isSignedIn = Boolean(auth?.user);

      if (pathname.startsWith('/api/auth')) return true;

      if (isPublicPath(pathname)) {
        // Bounce signed-in users away from the auth screens.
        if (isSignedIn && SIGNED_OUT_ONLY.includes(pathname)) {
          return Response.redirect(new URL('/home', request.nextUrl));
        }
        return true;
      }

      if (!isSignedIn) return false;

      // A new account sees onboarding once, before anything else. Skipping it
      // is allowed and recorded, so this never becomes a loop.
      if (!auth?.user?.onboardedAt && pathname !== '/onboarding') {
        return Response.redirect(new URL('/onboarding', request.nextUrl));
      }

      return true;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
