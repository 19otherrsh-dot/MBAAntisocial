import path from "node:path";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  turbopack: {},
  /**
   * Docker builds set BUILD_STANDALONE=1 for a self-contained server bundle;
   * `next start` and Vercel use the regular output. Tracing starts at the
   * monorepo root so packages/shared is included.
   */
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@mba/shared'],
  /**
   * Game builds and the player page are cross-origin isolated so threaded
   * Godot exports get SharedArrayBuffer. Builds live under versioned paths,
   * so they can be cached forever.
   */
  async headers() {
    const isolation = [
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
    ];
    return [
      { source: '/player/:path*', headers: isolation },
      // 3D showpieces: large, rarely changed; revalidate in the background.
      { source: '/models/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
      {
        source: '/game-builds/:path*',
        headers: [
          ...isolation,
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  /** Old paths keep working after the navigation rename. */
  async redirects() {
    return [
      { source: '/campus-report', destination: '/institute/report', permanent: true },
      { source: '/moderation', destination: '/institute/moderation', permanent: true },
      { source: '/ai-interview', destination: '/practice', permanent: true },
      { source: '/resume-roast', destination: '/resume', permanent: true },
      { source: '/offer-intel', destination: '/offers', permanent: true },
      { source: '/whisper-network', destination: '/reviews', permanent: true },
      { source: '/syndicate', destination: '/splits', permanent: true },
      { source: '/black-book', destination: '/network', permanent: true },
      { source: '/jobs', destination: '/opportunities', permanent: true },
      { source: '/rooms', destination: '/hub', permanent: true },
      { source: '/messages', destination: '/hub/dm', permanent: true },
    ];
  },
};

export default nextConfig;
