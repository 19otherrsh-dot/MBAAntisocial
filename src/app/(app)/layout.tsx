import { redirect } from 'next/navigation';
import { preload } from 'react-dom';
import { auth } from '@/lib/auth';
import AppShell from '@/components/layout/AppShell';

/**
 * Server-side gate for every signed-in page.
 *
 * Middleware already redirects unauthenticated requests; this is the second
 * check, so a page never renders without a session even if the matcher is ever
 * misconfigured. Guarding here rather than in a client `useEffect` also means
 * no flash of the dashboard shell before the redirect.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  /*
   * Every signed-in page needs the account and the game state before it can
   * draw anything meaningful. Hinting them here starts both requests while the
   * JavaScript is still downloading, instead of after it has booted — on a
   * throttled phone that is most of a second. `anonymous` matches the
   * credentials mode of the app's own `fetch`, so the browser reuses the
   * preloaded response rather than asking twice.
   *
   * Issued before awaiting the session, so the hints go out in the first
   * flush of the page rather than streamed after it. The proxy has already
   * turned away signed-out visitors, so these are never wasted.
   */
  preload('/api/me', { as: 'fetch', crossOrigin: 'anonymous' });
  preload('/api/game', { as: 'fetch', crossOrigin: 'anonymous' });

  const session = await auth();
  if (!session?.user) redirect('/login');

  return <AppShell>{children}</AppShell>;
}
