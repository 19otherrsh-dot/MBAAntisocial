'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Lock } from 'lucide-react';
import { MOBILE_TABS, SECTIONS, canSee, isActive } from './navigation';
import { useMe } from '@/lib/client/me';
import { featureAvailable } from '@mba/shared/campus';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

/**
 * Phones get four destinations people use daily plus a Menu that opens every
 * section — instead of sixteen squeezed icons nobody can hit.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { me, unread } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);

  // Close the sheet once a link inside it has navigated somewhere.
  if (menuOpen && pathname !== openedAt) {
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [menuOpen]);

  const tabActive = (match: string[]) => !menuOpen && match.some((href) => isActive(pathname, href));
  const anyTabActive = MOBILE_TABS.some((tab) => tab.match.some((href) => isActive(pathname, href)));

  return (
    <>
      <nav className={styles.mobileNav} aria-label="Sections">
        {MOBILE_TABS.map((tab) => {
          const active = tabActive(tab.match);
          const Icon = tab.icon;
          return (
            <Link key={tab.id} href={tab.href} className={cn(styles.mobileItem, active && styles.mobileItemActive)} aria-current={active ? 'page' : undefined}>
              <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
              {tab.label}
            </Link>
          );
        })}
        <button
          className={cn(styles.mobileItem, (menuOpen || !anyTabActive) && styles.mobileItemActive)}
          onClick={() => {
            setOpenedAt(pathname);
            setMenuOpen(!menuOpen);
          }}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
          Menu
          {unread > 0 && !menuOpen && <span className={styles.mobileBadge} />}
        </button>
      </nav>

      {menuOpen && (
        <div className={styles.menuSheet} role="dialog" aria-modal="true" aria-label="All sections">
          <div className={styles.menuSheetInner}>
            {SECTIONS.filter((s) => s.id !== 'today').map((section) => {
              const items = section.items.filter((item) => canSee(item, me));
              if (items.length === 0) return null;
              return (
                <section key={section.id} className={styles.menuGroup}>
                  <Link href={section.href} className={styles.menuGroupTitle}>
                    {section.label}
                  </Link>
                  <div className={styles.menuGrid}>
                    {items.map((item) => {
                      const Icon = item.icon;
                      const locked = item.feature ? !featureAvailable(item.feature, me?.edition ?? 'open') : false;
                      return (
                        <Link key={item.href} href={item.href} className={cn(styles.menuTile, isActive(pathname, item.href) && styles.menuTileActive)}>
                          <Icon size={20} />
                          <span>{item.short}</span>
                          {locked && <Lock size={10} className={styles.menuTileLock} />}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
