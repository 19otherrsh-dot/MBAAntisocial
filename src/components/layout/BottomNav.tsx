'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LogOut, UserRound, X } from 'lucide-react';
import { NAV_GROUPS, TABS, canSee, isActive, sectionForPath } from './navigation';
import { useMe } from '@/lib/client/me';
import { MODERATOR_ROLES, STAFF_ROLES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

/**
 * The phone navigation: four destinations and a "More" sheet holding the rest.
 *
 * The sheet is a native `<dialog>` opened with `showModal()`, which gives a
 * focus trap, Escape to close, and an inert page behind it without any of it
 * being reimplemented here.
 */
export default function BottomNav() {
  const pathname = usePathname();
  const { me, unreadMessages } = useMe();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const viewer = {
    canModerate: me ? MODERATOR_ROLES.includes(me.role) : false,
    isStaff: me ? STAFF_ROLES.includes(me.role) : false,
  };
  const section = sectionForPath(pathname);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <nav className={styles.mobileNav} aria-label="Sections">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.href
            ? (section !== null && tab.sections.includes(section)) || isActive(pathname, tab.href)
            : open || (section !== null && tab.sections.includes(section)) || pathname.startsWith('/profile');
          const dot = tab.label === 'Campus' && unreadMessages > 0;

          const body = (
            <>
              <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
              {tab.label}
              {dot && <span className={styles.mobileBadge} aria-label="Unread messages" />}
            </>
          );

          return tab.href ? (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(styles.mobileItem, active && styles.mobileItemActive)}
              aria-current={isActive(pathname, tab.href) ? 'page' : undefined}
            >
              {body}
            </Link>
          ) : (
            <button
              key={tab.label}
              type="button"
              className={cn(styles.mobileItem, active && styles.mobileItemActive)}
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              {body}
            </button>
          );
        })}
      </nav>

      <dialog
        ref={dialogRef}
        className={styles.sheet}
        aria-label="All sections"
        onClose={() => setOpen(false)}
        // A click on the backdrop lands on the dialog element itself.
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className={styles.sheetHead}>
          <span className={styles.sheetTitle}>Everything</span>
          <button type="button" className={styles.iconButton} onClick={() => setOpen(false)} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={styles.sheetBody}>
          {NAV_GROUPS.filter((group) => group.label).map((group) => {
            const items = group.items.filter((item) => canSee(item, viewer));
            if (items.length === 0) return null;
            return (
              <section key={group.key}>
                <div className={styles.navGroupLabel}>{group.label}</div>
                <div className={styles.sheetGrid}>
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(styles.sheetItem, active && styles.sheetItemActive)}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setOpen(false)}
                      >
                        <span className={styles.sheetIcon}>
                          <Icon size={18} />
                          {item.showsUnreadMessages && unreadMessages > 0 && (
                            <span className={styles.mobileBadge} aria-label="Unread" />
                          )}
                        </span>
                        <span>
                          <span className={styles.sheetLabel}>{item.label}</span>
                          {item.hint && <span className={styles.sheetHint}>{item.hint}</span>}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <div className={styles.sheetFooter}>
            <Link href="/profile" className={styles.sheetItem} onClick={() => setOpen(false)}>
              <span className={styles.sheetIcon}>
                <UserRound size={18} />
              </span>
              <span className={styles.sheetLabel}>Profile and settings</span>
            </Link>
            <button type="button" className={styles.sheetItem} onClick={() => signOut({ callbackUrl: '/login' })}>
              <span className={styles.sheetIcon}>
                <LogOut size={18} />
              </span>
              <span className={styles.sheetLabel}>Sign out</span>
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
