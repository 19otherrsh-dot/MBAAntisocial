'use client';

import { useEffect } from 'react';
import { SessionProvider } from 'next-auth/react';
import { registerServiceWorker } from '@/lib/client/push';
import { ThemeProvider } from '@/lib/client/theme';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * App-wide client providers. `MeProvider` is mounted by the dashboard shell
 * rather than here, so public pages never fire an authenticated request.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  // Offline fallback and push. Skipped in development so a stale worker never
  // serves an old bundle while you are iterating.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') void registerServiceWorker();
  }, []);

  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
