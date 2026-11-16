'use client';

import { ThemeProvider } from '@/lib/client/theme';
import { ToastProvider } from '@/components/ui/Toast';
import ServiceWorker from '@/components/ServiceWorker';

/**
 * App-wide client providers.
 *
 * No `SessionProvider` here: it fetched the session twice on every page load,
 * and nothing in the app shell reads it — the signed-in user comes from
 * `/api/me`. The one component that needs it mounts its own.
 *
 * `MeProvider` is mounted by the dashboard shell rather than here, so public
 * pages never fire an authenticated request.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
      <ServiceWorker />
    </ThemeProvider>
  );
}
