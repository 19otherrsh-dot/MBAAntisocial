'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, UserRound, Search } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';
import CommandPalette from './CommandPalette';
import CampusLocked from './CampusLocked';
import { itemForPath, titleForPath } from './navigation';
import { MeProvider, useMe } from '@/lib/client/me';
import { RealtimeProvider } from '@/lib/client/realtime';
import { usePersistentFlag } from '@/lib/client/hooks';
import { featureAvailable } from '@mba/shared/campus';
import { LogoMark } from '@/components/brand/Logo';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

const COLLAPSE_KEY = 'sidebar-collapsed';

export default function AppShell({ children, embedded = false }: { children: React.ReactNode; embedded?: boolean }) {
  return (
    <MeProvider>
      <RealtimeProvider>
        <ShellFrame embedded={embedded}>{children}</ShellFrame>
      </RealtimeProvider>
    </MeProvider>
  );
}

function ShellFrame({ children, embedded }: { children: React.ReactNode; embedded: boolean }) {
  const pathname = usePathname();
  const { me } = useMe();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Read straight from localStorage through an external store, so the stored
  // preference does not have to be copied into state by an effect.
  const [collapsed, setCollapsed] = usePersistentFlag(COLLAPSE_KEY, false);
  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  // ⌘K / Ctrl+K anywhere; "/" when not typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // One edition gate for every page, instead of each page checking for itself.
  const item = itemForPath(pathname);
  const locked = Boolean(me && item?.feature && !featureAvailable(item.feature, me.edition));

  if (embedded) {
    return (
      <div className={styles.embedded}>
        <main id="content" tabIndex={-1} className={styles.content}>{locked && item ? <CampusLocked item={item} /> : children}</main>
      </div>
    );
  }

  return (
    <div className={cn(styles.shell, collapsed && styles.shellCollapsed)}>
      {/* First stop for keyboard users: past ~40 sidebar links straight to the page. */}
      <a href="#content" className="skip-link">Skip to content</a>
      <Sidebar collapsed={collapsed} onToggle={toggle} onOpenPalette={openPalette} />

      <div className={styles.main}>
        <header className={styles.topbar}>
          {/* Stands in for the sidebar, which is hidden on small screens. */}
          <Link href="/home" className={styles.mobileBrand} aria-label="MBAAntisocial home">
            <LogoMark size={22} />
          </Link>

          {/* Where you are, not the page's heading: each page renders its own h1. */}
          <p className={cn(styles.topbarTitle, 'truncate')}>{titleForPath(pathname)}</p>

          <div className={styles.topbarActions}>
            <button className={cn(styles.iconButton, styles.mobileOnly)} onClick={openPalette} aria-label="Search">
              <Search size={18} />
            </button>
            <ThemeToggle />
            <NotificationBell />
            <Link href="/profile" className={styles.iconButton} aria-label="Your profile">
              <UserRound size={18} />
            </Link>
            <button className={styles.iconButton} onClick={() => signOut({ callbackUrl: '/login' })} aria-label="Sign out" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </header>

        <main id="content" tabIndex={-1} className={styles.content}>{locked && item ? <CampusLocked item={item} /> : children}</main>
      </div>

      <BottomNav />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

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
