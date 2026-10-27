import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Providers from '@/components/Providers';
import './globals.css';

/*
 * Self-hosted at build time by next/font, so there is no render-blocking
 * request to a font CDN and no layout shift when the face swaps in.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  axes: ['opsz'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-jet',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: {
    default: 'MBAAntisocial — the operating layer for B-school',
    template: '%s · MBAAntisocial',
  },
  description:
    'Book mock interviews with actual seniors, track every deadline, and find your batch’s notes. One app instead of nine group chats.',
  applicationName: 'MBAAntisocial',
  robots: { index: true, follow: true },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Antisocial',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f6' },
    { media: '(prefers-color-scheme: dark)', color: '#100f14' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Applies the stored theme before first paint. Inlined and run synchronously
 * in <head>: doing this in React would paint the default palette first and
 * flash the wrong theme on every load.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
