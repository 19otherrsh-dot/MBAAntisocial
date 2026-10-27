'use client';

import Link from 'next/link';
import { Lock, ArrowRight } from 'lucide-react';
import { SECTIONS, canSee, type NavSection } from './navigation';
import { useMe } from '@/lib/client/me';
import { featureAvailable } from '@mba/shared/campus';
import { cn } from '@/lib/utils';
import Showpiece from '@/components/motion/Showpiece';
import Spotlight from '@/components/motion/Spotlight';
import { SHOWPIECES } from '@/components/motion/showpieces';
import styles from './shell.module.css';

/**
 * A section's front door: a hero, then every destination in it as a tile with
 * one honest line about what it does. A few sections carry a 3D centrepiece
 * that turns as you scroll. Optional `children` render between the two.
 */
function aspectNumber(aspect: string): number {
  const [w, h] = aspect.split('/').map((n) => Number(n.trim()));
  return w && h ? w / h : 1;
}

export default function SectionLanding({ id, children }: { id: NavSection['id']; children?: React.ReactNode }) {
  const { me } = useMe();
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) return null;
  const items = section.items.filter((item) => canSee(item, me));
  const showpiece = SHOWPIECES[id];
  const SectionIcon = section.icon;

  return (
    <>
      <header className={cn(styles.landingHero, showpiece && styles.landingHeroWithPiece)} data-aurora="">
        <div className={styles.landingHeroText} data-hero-recede="">
          <span className={styles.landingEyebrow}><SectionIcon size={14} /> {section.label}</span>
          <h2 className={styles.landingTitle} data-title-in="">{section.description}</h2>
          <p className={styles.landingSubtitle}>{items.length} {items.length === 1 ? 'place' : 'places'} to go from here.</p>
        </div>
        {showpiece && (
          <div className={styles.landingPieceWrap} style={{ ['--ar' as string]: aspectNumber(showpiece.aspect) }}>
            <Showpiece {...showpiece} className={styles.landingPiece} />
          </div>
        )}
      </header>
      {children}
      <Spotlight className={styles.tileGrid}>
        <div className={styles.tileGridInner} data-reveal="">
          {items.map((item) => {
            const Icon = item.icon;
            const locked = item.feature ? !featureAvailable(item.feature, me ? me.edition : 'campus') : false;
            return (
              <Link key={item.href} href={item.href} className={cn(styles.tile, locked && styles.tileLocked)} data-spot="">
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
      </Spotlight>
    </>
  );
}
