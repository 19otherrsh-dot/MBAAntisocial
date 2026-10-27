import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

/**
 * Runs the edge-safe auth config's `authorized` callback on every matched
 * request, so unauthenticated users are redirected before any dashboard code
 * or data fetch runs.
 *
 * This is the `proxy` file convention, which replaced `middleware` in Next 16.
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    /*
     * Page routes only. `/api/*` is excluded on purpose: this layer answers an
     * unauthenticated request with a redirect to /login, which a `fetch` client
     * cannot act on. API routes are guarded by the `route()` wrapper instead,
     * which returns a real 401 JSON body.
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml).*)',
  ],
};
