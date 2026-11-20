import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Only an HTTPS deployment may tell browsers to upgrade requests: on plain
 * HTTP (local, a LAN demo, a container without TLS in front) it would rewrite
 * the app's own asset URLs to an https origin that is not there.
 */
const servedOverHttps = (process.env.APP_URL ?? '').startsWith('https://');

/**
 * Content Security Policy, the "without nonces" form from the Next.js guide.
 *
 * A nonce-based policy would force every page to render on demand; this one
 * keeps static pages static. Scripts may only come from this origin (plus the
 * inline bootstrap Next.js emits), so injected markup cannot pull in a script
 * from anywhere else. The connect list is the realtime provider; images may be
 * any https source because profile pictures are user-supplied links.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.pusher.com wss://*.pusher.com https://*.sentry.io${isDev ? ' ws:' : ''}`,
  "media-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(servedOverHttps ? ['upgrade-insecure-requests'] : []),
].join('; ');

const nextConfig: NextConfig = {
  turbopack: {},

  // A self-contained server bundle in .next/standalone, for the Docker image,
  // which sets NEXT_OUTPUT=standalone. Off otherwise, so `npm start` works and
  // Vercel deploys as usual.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Camera, microphone and location are never used; say so.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // HTTPS only, once deployed. Two years, as preload lists require.
          ...(servedOverHttps
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
      {
        // The worker must never be served from a cache, or a fix to it can take
        // days to reach anyone who has the app installed.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

/**
 * Sentry's build plugin only matters for uploading source maps, which needs an
 * auth token. Without one the config is exported untouched, so a deployment
 * that does not use Sentry builds exactly as before.
 */
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
    })
  : nextConfig;
