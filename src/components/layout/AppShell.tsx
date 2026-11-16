'use client';

import { useCallback, useEffect, ViewTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, UserRound } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import { titleForPath } from './navigation';
import { MeProvider, useMe } from '@/lib/client/me';
import { GameProvider } from '@/lib/client/game';
import GameHud from '@/components/game/GameHud';
import GameLayer from '@/components/game/GameLayer';
import { useRealtime } from '@/lib/client/realtime';
import { userChannel } from '@/lib/realtime';
import { usePersistentFlag } from '@/lib/client/hooks';
import { LogoMark } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

const COLLAPSE_KEY = 'sidebar-collapsed';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <GameProvider>
        <ShellFrame>{children}</ShellFrame>
        <GameLayer />
      </GameProvider>
    </MeProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useMe();

  /*
   * A new account sees onboarding once, before anything else. Routed from the
   * live account rather than the session token, which is a snapshot. Skipping
   * is recorded too, so this cannot loop.
   */
  const needsOnboarding = Boolean(me && !me.onboardedAt);
  useEffect(() => {
    if (needsOnboarding && pathname !== '/onboarding') router.replace('/onboarding');
  }, [needsOnboarding, pathname, router]);

  // Read straight from localStorage through an external store, so the stored
  // preference does not have to be copied into state by an effect.
  const [collapsed, setCollapsed] = usePersistentFlag(COLLAPSE_KEY, false);

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  return (
    <div className={cn(styles.shell, collapsed && styles.shellCollapsed)}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />

      <div className={styles.main}>
        <header className={styles.topbar}>
          {/* Stands in for the sidebar, which is hidden on small screens. */}
          <Link href="/home" className={styles.mobileBrand} aria-label="MBAAntisocial home">
            <LogoMark size={22} />
          </Link>

          <h1 className={cn(styles.topbarTitle, 'truncate')}>{titleForPath(pathname)}</h1>

          <div className={styles.topbarActions}>
            <GameHud />
            <span className={styles.desktopOnly}>
              <ThemeToggle />
            </span>
            <NotificationBell />
            <Link href="/profile" className={cn(styles.iconButton, styles.desktopOnly)} aria-label="Your profile">
              <UserRound size={18} />
            </Link>
            <button
              className={cn(styles.iconButton, styles.desktopOnly)}
              onClick={() => signOut({ callbackUrl: '/login' })}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className={styles.content}>
          {/*
           * Keyed by route, so every navigation hands the old page out and the
           * new one in as a view transition. The shell around it never moves —
           * only the content does, which is what keeps it from feeling jumpy.
           */}
          <ViewTransition key={pathname} enter="page-in" exit="page-out" default="none">
            <div className={styles.page}>{children}</div>
          </ViewTransition>
        </main>
      </div>

      <BottomNav />

      {/* Announces a streak milestone once, without a modal or a guilt trip. */}
      {me && <StreakAnnouncer />}
      {me && <MessageBadgeListener userId={me.id} onMessagesPage={pathname.startsWith('/messages')} />}
    </div>
  );
}

function StreakAnnouncer() {
  const { checkIn } = useMe();
  if (!checkIn?.milestone) return null;

  return (
    <div className="sr-only" role="status" aria-live="polite">
      {`Streak milestone reached: ${checkIn.milestone} days.`}
    </div>
  );
}

/**
 * Keeps the unread-messages badge live on every page except Messages itself,
 * which tracks its own count because it knows which thread is open.
 */
function MessageBadgeListener({ userId, onMessagesPage }: { userId: string; onMessagesPage: boolean }) {
  const { unreadMessages, setUnreadMessages } = useMe();
  useRealtime(userChannel(userId), 'new-message', () => {
    if (!onMessagesPage) setUnreadMessages(unreadMessages + 1);
  });
  return null;
}
