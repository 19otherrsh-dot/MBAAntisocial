import type { MetadataRoute } from 'next';

const base = process.env.APP_URL ?? 'http://localhost:3000';

/** Only the public pages are for search engines; the app is behind sign-in. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/legal/'], disallow: ['/api/', '/home', '/onboarding'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
