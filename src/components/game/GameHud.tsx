'use client';

import Link from 'next/link';
import { Flame, Shield, Zap } from 'lucide-react';
import { useOptionalGame } from '@/lib/client/game';
import { useCountUp } from '@/lib/client/useCountUp';
import { cn } from '@/lib/utils';
import styles from './game.module.css';

const RADIUS = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The always-visible scoreboard in the top bar: today's goal ring, the streak,
 * and the level. Everything links to the Path, where it is explained.
 */
export default function GameHud() {
  const game = useOptionalGame();
  const state = game?.state ?? null;
  const xp = useCountUp(state?.xp ?? 0);

  if (!state) return null;

  const fraction = Math.min(1, state.today.xp / Math.max(1, state.today.goal));
  const done = state.today.goalMet;

  return (
    <div className={styles.hud}>
      <Link
        href="/path"
        className={styles.hudChip}
        aria-label={`${state.today.xp} of ${state.today.goal} XP — daily goal`}
        title={`Today: ${state.today.xp}/${state.today.goal} XP`}
        style={{ paddingLeft: 3 }}
      >
        <span className={cn(styles.ring, done && styles.ringDone)}>
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
            <circle cx="17" cy="17" r={RADIUS} className={styles.ringTrack} />
            <circle
              cx="17"
              cy="17"
              r={RADIUS}
              className={styles.ringFill}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            />
          </svg>
          <span className={styles.ringLabel}>
            <Zap size={13} fill="currentColor" style={{ color: done ? 'var(--amber)' : 'var(--teal)' }} />
          </span>
        </span>
        <span className={styles.hudOptional}>{state.today.xp}</span>
      </Link>

      <Link href="/path" className={styles.hudChip} aria-label={`${state.streak.days} day streak`} title="Day streak">
        <Flame size={16} className={state.today.xp > 0 ? styles.hudFlame : styles.hudFlameCold} fill="currentColor" />
        {state.streak.days}
        {state.streak.shields > 0 && (
          <span className={styles.hudOptional} title={`${state.streak.shields} streak shield(s)`}>
            <Shield size={13} className={styles.hudShield} fill="currentColor" />
          </span>
        )}
      </Link>

      <Link
        href="/path"
        className={styles.hudChip}
        aria-label={`Lv ${state.level.level} · ${xp} XP — ${state.level.title}`}
        title={`${state.level.title} · ${state.level.toNext} XP to level ${state.level.level + 1}`}
      >
        <span style={{ color: 'var(--accent-text)' }}>Lv {state.level.level}</span>
        <span className={styles.hudOptional} style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
          · {xp} XP
        </span>
      </Link>
    </div>
  );
}
