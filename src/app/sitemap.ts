import type { MetadataRoute } from 'next';

const base = process.env.APP_URL ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/register', '/login', '/legal/privacy', '/legal/terms', '/legal/honor-code'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.5,
  }));
}
