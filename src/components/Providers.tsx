'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from '@/lib/client/theme';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * App-wide client providers. `MeProvider` is mounted by the dashboard shell
 * rather than here, so public pages never fire an authenticated request.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
