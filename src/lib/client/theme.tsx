'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeApi {
  preference: ThemePreference;
  /** What is actually on screen once "system" is resolved. */
  resolved: 'light' | 'dark';
  setPreference: (value: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function useTheme(): ThemeApi {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within <ThemeProvider>');
  return context;
}

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/*
 * Both the stored preference and the OS setting are external mutable sources,
 * so they are read through `useSyncExternalStore` rather than copied into state
 * by an effect. That avoids the extra render pass a `setState` in an effect
 * body costs, and it means a change in another tab or a change to the OS theme
 * propagates without any additional wiring.
 */

const preferenceListeners = new Set<() => void>();

function subscribeToPreference(onChange: () => void): () => void {
  preferenceListeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    preferenceListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function subscribeToSystem(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function readSystem(): 'light' | 'dark' {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  /*
   * The server snapshots are the neutral defaults. The inline script in the
   * document head has already applied the stored theme to the root element
   * before first paint, so there is no flash — this only reconciles what the
   * toggle displays.
   */
  const preference = useSyncExternalStore(
    subscribeToPreference,
    readPreference,
    () => 'system' as const
  );

  const systemTheme = useSyncExternalStore(
    subscribeToSystem,
    readSystem,
    () => 'light' as const
  );

  const resolved = preference === 'system' ? systemTheme : preference;

  const setPreference = useCallback((value: ThemePreference) => {
    if (value === 'system') {
      localStorage.removeItem(STORAGE_KEY);
      document.documentElement.removeAttribute('data-theme');
    } else {
      localStorage.setItem(STORAGE_KEY, value);
      document.documentElement.setAttribute('data-theme', value);
    }
    // `storage` does not fire in the tab that wrote the value, so subscribers
    // here are notified explicitly.
    for (const listener of preferenceListeners) listener();
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
