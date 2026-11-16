/*
 * MBAAntisocial service worker.
 *
 * Deliberately small. It does three things:
 *
 *  1. Static build assets (`/_next/static/…`, which are content-hashed and
 *     never change) are served from cache once fetched, so the app shell opens
 *     instantly on a bad campus network.
 *  2. Page navigations go to the network first. When the network is gone, the
 *     last copy of that page is shown, or the offline page if there is none.
 *  3. API responses are never cached. They carry one person's private data —
 *     their pipeline, their messages — and a stale or shared copy of that is
 *     worse than an error.
 *
 * Bump VERSION to retire every cache on the next visit.
 */
const VERSION = 'v1';
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Private, per-user, and must be fresh: never touched.
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/') || /^\/icon-\d+x\d+\.png$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    // Only successful, non-redirected pages are kept: a redirect to /login
    // must not be replayed later as if it were the page.
    if (response.ok && !response.redirected) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}
