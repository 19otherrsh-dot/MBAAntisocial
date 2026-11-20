'use client';

import { useEffect } from 'react';

/**
 * Last-resort error screen, used when the root layout itself fails. It
 * replaces the whole document, so it carries its own <html> and inline styles
 * rather than relying on the app's stylesheet having loaded.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Reported to Sentry when it is configured; the screen below shows either way.
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error)).catch(() => undefined);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#faf9f6',
          color: '#1c1b19',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#6f6c64', lineHeight: 1.6 }}>
            The app hit an error it could not recover from. Your data is safe. Try again, and if it
            keeps happening, reload the page.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              height: 44,
              padding: '0 20px',
              border: 0,
              borderRadius: 10,
              background: '#5b47f5',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
