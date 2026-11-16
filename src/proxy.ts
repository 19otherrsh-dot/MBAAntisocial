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
     *
     * The service worker, manifest, and icons are excluded too: a browser
     * fetches them without a session, and answering with a login redirect
     * makes the app uninstallable and the worker fail to register.
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|icon-\\d+x\\d+\\.png|apple-icon.png|manifest.webmanifest|sw.js|robots.txt|sitemap.xml).*)',
  ],
};
