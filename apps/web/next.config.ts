import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  turbopack: {},
  transpilePackages: ['@mba/shared'],
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
