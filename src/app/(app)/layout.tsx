import { redirect } from 'next/navigation';
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
  const session = await auth();
  if (!session?.user) redirect('/login');

  return <AppShell>{children}</AppShell>;
}
