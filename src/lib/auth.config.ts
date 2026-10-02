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

const PUBLIC_PATHS = ['/', '/login', '/register', '/legal/honor-code', '/legal/privacy'];

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
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id ?? token.sub ?? '';
        token.campus = user.campus ?? '';
        token.batch = user.batch ?? '';
        token.year = user.year ?? 1;
        token.role = user.role ?? 'student';
        token.onboardedAt = user.onboardedAt ?? null;
      }

      // `useSession().update(...)` after profile edits, so the sidebar and
      // route guards reflect a role or campus change without a re-login.
      if (trigger === 'update' && session) {
        const patch = session as Partial<{
          campus: string;
          batch: string;
          year: 1 | 2;
          role: typeof token.role;
          onboardedAt: string | null;
        }>;
        if (patch.campus) token.campus = patch.campus;
        if (patch.batch) token.batch = patch.batch;
        if (patch.year) token.year = patch.year;
        if (patch.role) token.role = patch.role;
        if (patch.onboardedAt !== undefined) token.onboardedAt = patch.onboardedAt;
      }

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
        if (isSignedIn && (pathname === '/login' || pathname === '/register')) {
          return Response.redirect(new URL('/home', request.nextUrl));
        }
        return true;
      }

      return isSignedIn;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
