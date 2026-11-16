'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useGame, type Celebration } from '@/lib/client/game';
import { useCountUpFromZero } from '@/lib/client/useCountUp';
import { playSound } from '@/lib/client/sound';
import Confetti from '@/components/ui/Confetti';
import Mascot, { type MascotMood } from './Mascot';
import styles from './game.module.css';

const MOOD: Record<Celebration['kind'], MascotMood> = {
  goal: 'cheer',
  level: 'cheer',
  achievement: 'proud',
  streak: 'wow',
  chest: 'cheer',
};

const subscribeNever = () => () => {};

/** Everything the game draws on top of the app: XP floats, quest toasts, celebrations. */
export default function GameLayer() {
  const { celebration, dismissCelebration, floats, toasts, dismissToast, claimQuest } = useGame();
  // False during server render and hydration, true after: the portal target
  // only exists in the browser, and rendering it early would mismatch.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={styles.floats} aria-live="polite">
        {floats.map((entry) => (
          <span key={entry.id} className={styles.float}>
            +{entry.amount} XP
          </span>
        ))}
      </div>

      <div className={styles.questToasts}>
        {toasts.map(({ id, quest }) => (
          <div key={id} className={styles.questToast} role="status">
            <span className={styles.questToastIcon}>
              <Check size={18} strokeWidth={3} />
            </span>
            <span className={styles.questToastText}>
              <strong>Quest complete!</strong>
              {quest.title}
            </span>
            <button
              type="button"
              className={`${styles.chunky} ${styles.chunkyGold}`}
              onClick={() => {
                dismissToast(id);
                void claimQuest(quest.key);
              }}
            >
              +{quest.xp} XP
            </button>
          </div>
        ))}
      </div>

      {celebration && (
        <CelebrationScreen key={celebration.id} celebration={celebration} onContinue={dismissCelebration} />
      )}
    </>,
    document.body
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  const shown = useCountUpFromZero(value);
  return (
    <div className={styles.celebrateStat}>
      <div className={styles.celebrateStatLabel}>{label}</div>
      <div className={styles.celebrateStatValue}>
        {shown}
        {suffix}
      </div>
    </div>
  );
}

function CelebrationScreen({ celebration, onContinue }: { celebration: Celebration; onContinue: () => void }) {
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    playSound(celebration.kind === 'level' ? 'level' : 'success');
    const previouslyFocused = document.activeElement as HTMLElement | null;
    button.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onContinue();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [celebration.kind, onContinue]);

  return (
    <div className={styles.celebrateBackdrop} role="dialog" aria-modal="true" aria-labelledby="celebrate-title">
      <Confetti />
      <div className={styles.celebrateCard}>
        <div className={styles.celebrateRays} aria-hidden />
        <Mascot mood={MOOD[celebration.kind]} size={128} />
        <h2 id="celebrate-title" className={styles.celebrateTitle}>
          {celebration.title}
        </h2>
        <p className={styles.celebrateBody}>{celebration.body}</p>
        {celebration.stats.length > 0 && (
          <div className={styles.celebrateStats}>
            {celebration.stats.map((stat) => (
              <Stat key={stat.label} {...stat} />
            ))}
          </div>
        )}
        <button ref={button} type="button" className={styles.celebrateContinue} onClick={onContinue}>
          CONTINUE
        </button>
        {celebration.kind === 'goal' && (
          <Link href="/path" onClick={onContinue} className="dim" style={{ fontSize: 'var(--t-sm)', position: 'relative' }}>
            See your quests
          </Link>
        )}
      </div>
    </div>
  );
}
