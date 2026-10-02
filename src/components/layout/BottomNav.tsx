'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRIMARY_NAV } from './navigation';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.mobileNav} aria-label="Sections">
      {PRIMARY_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(styles.mobileItem, active && styles.mobileItemActive)}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={20} strokeWidth={active ? 2.3 : 1.8} />
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
