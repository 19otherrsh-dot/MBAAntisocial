'use client';

import Link from 'next/link';
import { Lock, ArrowRight } from 'lucide-react';
import { SECTIONS, canSee, type NavSection } from './navigation';
import { useMe } from '@/lib/client/me';
import { featureAvailable } from '@mba/shared/campus';
import { cn } from '@/lib/utils';
import styles from './shell.module.css';

/**
 * A section's front door: every destination in it as a tile with one honest
 * line about what it does. Optional `children` render above the tiles for
 * section-specific highlights.
 */
export default function SectionLanding({ id, children }: { id: NavSection['id']; children?: React.ReactNode }) {
  const { me } = useMe();
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) return null;
  const items = section.items.filter((item) => canSee(item, me));

  return (
    <>
      <div>
        <h2 className={styles.landingTitle}>{section.label}</h2>
        <p className={styles.landingSubtitle}>{section.description}</p>
      </div>
      {children}
      <div className={styles.tileGrid}>
        {items.map((item) => {
          const Icon = item.icon;
          const locked = item.feature ? !featureAvailable(item.feature, me?.edition ?? 'open') : false;
          return (
            <Link key={item.href} href={item.href} className={cn(styles.tile, locked && styles.tileLocked)}>
              <span className={styles.tileIcon}>
                <Icon size={20} />
              </span>
              <span className={styles.tileText}>
                <span className={styles.tileTitle}>
                  {item.label}
                  {locked && <Lock size={12} aria-label="Locked" />}
                </span>
                <span className={styles.tileBody}>{item.description}</span>
              </span>
              <ArrowRight size={16} className={styles.tileArrow} />
            </Link>
          );
        })}
      </div>
    </>
  );
}
