'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, UserRound } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import { titleForPath } from './navigation';
import { MeProvider, useMe } from '@/lib/client/me';
import { usePersistentFlag } from '@/lib/client/hooks';
import { LogoMark } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

const COLLAPSE_KEY = 'sidebar-collapsed';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MeProvider>
      <ShellFrame>{children}</ShellFrame>
    </MeProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useMe();

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
            <ThemeToggle />
            <NotificationBell />
            <Link href="/profile" className={styles.iconButton} aria-label="Your profile">
              <UserRound size={18} />
            </Link>
            <button
              className={styles.iconButton}
              onClick={() => signOut({ callbackUrl: '/login' })}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>

      <BottomNav />

      {/* Announces a streak milestone once, without a modal or a guilt trip. */}
      {me && <StreakAnnouncer />}
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
