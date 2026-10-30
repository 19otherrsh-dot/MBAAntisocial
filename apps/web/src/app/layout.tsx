import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Providers from '@/components/Providers';
import './globals.css';

/*
 * Inter and JetBrains Mono (both SIL OFL 1.1; licences in fonts/), latin subset,
 * as variable fonts committed with the app. next/font serves them from our own
 * origin with fallback metrics, so there is no request to a font CDN and no
 * layout shift; keeping the files in the repo also means a build never depends
 * on what Google Fonts happens to return that day.
 */
const inter = localFont({
  src: './fonts/inter-latin.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900',
});

const jetbrainsMono = localFont({
  src: './fonts/jetbrains-mono-latin.woff2',
  variable: '--font-mono-jet',
  display: 'swap',
  weight: '100 800',
  // Metric matching against Arial suits a sans face only; the CSS stack falls back to a system monospace.
  adjustFontFallback: false,
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
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
