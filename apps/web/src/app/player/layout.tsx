import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { MeProvider } from '@/lib/client/me';
import { RealtimeProvider } from '@/lib/client/realtime';

export const metadata = { title: 'Playing' };

/**
 * The game player sits outside the app shell: full screen, no navigation
 * chrome, and cross-origin isolated (see next.config.ts) for threaded builds.
 */
export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.verified) redirect('/verify-email');
  return (
    <MeProvider>
      <RealtimeProvider>{children}</RealtimeProvider>
    </MeProvider>
  );
}
