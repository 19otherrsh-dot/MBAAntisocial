import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MBAAntisocial',
    short_name: 'Antisocial',
    description: 'The day-to-day operating layer for a B-school student.',
    // Opens on Today — the page built to be the first thing you see.
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    background_color: '#faf9f6',
    theme_color: '#faf9f6',
    icons: [
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
