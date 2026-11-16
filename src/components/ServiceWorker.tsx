'use client';

import { useEffect } from 'react';

/**
 * Registers `public/sw.js` in production builds.
 *
 * Skipped in development, where a worker caching hot-reloaded assets makes
 * every change look like it did not apply.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // An unsupported or blocked worker only loses the offline fallback.
    });
  }, []);

  return null;
}
