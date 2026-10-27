/*
 * MBAAntisocial service worker. Hand-written and deliberately small:
 * - an offline fallback for navigations (no stale data is ever served as fresh);
 * - Web Push display, grouped by notification kind;
 * - notification clicks focus an open tab or open a new one.
 */
const VERSION = 'v1';
const OFFLINE_URL = '/offline';
const SHELL_CACHE = `shell-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icon-192x192.png', '/manifest.json']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener('push', (event) => {
  let payload = { title: 'MBAAntisocial', body: '', href: '/home', tag: undefined };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { href: payload.href },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/home';
  const target = new URL(href, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
