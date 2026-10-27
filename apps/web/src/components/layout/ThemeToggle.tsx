'use client';

import { Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/lib/client/theme';
import styles from './shell.module.css';

const ORDER: ThemePreference[] = ['light', 'dark', 'system'];

const META: Record<ThemePreference, { icon: React.ReactNode; label: string }> = {
  light: { icon: <Sun size={17} />, label: 'Light' },
  dark: { icon: <Moon size={17} />, label: 'Dark' },
  system: { icon: <MonitorSmartphone size={17} />, label: 'System' },
};

/** Cycles light → dark → system. Three states, one control. */
export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];

  return (
    <button
      className={styles.iconButton}
      onClick={() => setPreference(next)}
      aria-label={`Theme: ${META[preference].label}. Switch to ${META[next].label}.`}
      title={`Theme: ${META[preference].label}`}
    >
      {META[preference].icon}
    </button>
  );
}
