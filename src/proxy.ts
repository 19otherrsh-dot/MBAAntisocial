import NextAuth from 'next-auth';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { authConfig } from '@/lib/auth.config';

/**
 * Runs the edge-safe auth config's `authorized` callback on every matched
 * request, so unauthenticated users are redirected before any dashboard code
 * or data fetch runs.
 *
 * This is the `proxy` file convention, which replaced `middleware` in Next 16.
 */
const { auth } = NextAuth(authConfig);
const authorize = auth as unknown as (request: NextRequest, event: NextFetchEvent) => Promise<Response>;

/**
 * Background requests from the client router — link prefetches and in-app
 * navigations, which `fetch` RSC payloads rather than load a document.
 *
 * Next strips its own `RSC` and prefetch headers before the proxy runs, so
 * this reads the browser's `Sec-Fetch-Dest` instead: `document` for a page
 * load, `empty` for a fetch. Clients that do not send it are treated as page
 * loads, which keeps the old behaviour for them.
 */
function isRouterFetch(request: NextRequest): boolean {
  const destination = request.headers.get('sec-fetch-dest');
  return destination !== null && destination !== 'document';
}

const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?=/;
const CLEARS = /;\s*(max-age=0|expires=thu, 01 jan 1970)/i;

/**
 * Auth.js re-issues the session cookie on every request it sees, to roll the
 * expiry forward. On router fetches that is a hazard: a burst of prefetches is
 * usually in flight right after a page loads, and if the user signs out then,
 * the late responses write the session back after sign-out cleared it — so the
 * user stays signed in. Rolling only on full page loads keeps the expiry fresh
 * and makes sign-out stick. A cookie being *cleared* always passes through.
 */
function withoutSessionRefresh(response: Response): Response {
  const cookies = response.headers.getSetCookie();
  const keep = cookies.filter((cookie) => !SESSION_COOKIE.test(cookie) || CLEARS.test(cookie));
  if (keep.length === cookies.length) return response;
  // Copied rather than edited: a redirect's headers can be immutable.
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  for (const cookie of keep) headers.append('set-cookie', cookie);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await authorize(request, event);
  return isRouterFetch(request) ? withoutSessionRefresh(response) : response;
}

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
