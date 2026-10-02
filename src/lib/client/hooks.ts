'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api, errorMessage } from './api';

interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Applies a local change without waiting for a round trip. */
  mutate: (updater: (current: T) => T) => void;
}

/** State keyed by the request it belongs to, so `loading` can be derived. */
interface Settled<T> {
  key: string;
  data: T | null;
  error: string | null;
}

/**
 * Fetches JSON from an API route and keeps the result in state.
 *
 * Two things it does deliberately:
 *
 * - Requests are aborted when the key changes or the component unmounts, so a
 *   slow response for a filter the user has already moved past cannot land and
 *   overwrite the current one.
 * - `loading` is derived by comparing the settled result's key against the
 *   current one, rather than flipped by a `setState` at the top of the effect.
 *   Setting state synchronously inside an effect causes a second render pass
 *   before the browser paints; deriving it costs nothing and stays correct when
 *   several key changes queue up.
 *
 * Passing `path: null` disables the query entirely — useful for a request that
 * only makes sense once some precondition holds.
 */
export function useApiQuery<T>(
  path: string | null,
  query?: Record<string, string | number | boolean | undefined | null>
): QueryResult<T> {
  const [settled, setSettled] = useState<Settled<T>>({ key: '', data: null, error: null });
  const [nonce, setNonce] = useState(0);

  // Serialised so the effect re-runs on value changes, not on a new object identity.
  const queryKey = useMemo(() => JSON.stringify(query ?? {}), [query]);
  const key = path ? `${nonce}:${path}:${queryKey}` : '';

  useEffect(() => {
    if (!path) return;

    const controller = new AbortController();

    api
      .get<T>(path, JSON.parse(queryKey), controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSettled({ key, data, error: null });
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setSettled({ key, data: null, error: errorMessage(caught) });
        }
      });

    return () => controller.abort();
  }, [path, queryKey, key]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  const mutate = useCallback((updater: (current: T) => T) => {
    setSettled((current) =>
      current.data === null ? current : { ...current, data: updater(current.data) }
    );
  }, []);

  const matches = settled.key === key;

  return {
    data: matches ? settled.data : null,
    // A disabled query is never loading; an in-flight one has not settled yet.
    loading: Boolean(path) && !matches,
    error: matches ? settled.error : null,
    refetch,
    mutate,
  };
}

interface ActionResult<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  pending: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * Wraps an async action with pending state and error capture, and drops the
 * result if the component unmounted while it was in flight.
 *
 * `run` intentionally depends on `action`, so a new identity each render is
 * expected. Actions are invoked from event handlers rather than effects, where
 * a stable identity buys nothing and a stale closure would cost correctness.
 */
export function useAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>
): ActionResult<TArgs, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setError(null);
      try {
        return await action(...args);
      } catch (caught) {
        if (mounted.current) setError(errorMessage(caught));
        return undefined;
      } finally {
        if (mounted.current) setPending(false);
      }
    },
    [action]
  );

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}

/* ───────────────────────── Clock ───────────────────────── */

const MINUTE_MS = 60_000;

function subscribeToClock(onChange: () => void): () => void {
  const id = setInterval(onChange, MINUTE_MS);
  return () => clearInterval(id);
}

function clockSnapshot(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

/**
 * The current time, quantised to the minute.
 *
 * Reading `Date.now()` during render makes a component non-idempotent: the same
 * props produce different output depending on when React happens to re-run it,
 * which breaks under concurrent rendering and can desync from what was
 * hydrated. `useSyncExternalStore` is the sanctioned way to read a mutable
 * external source — here the wall clock — and it re-renders subscribers when
 * the value changes, so "3h left" counts down on its own instead of going stale
 * until something unrelated triggers a render.
 *
 * Quantising to the minute keeps the snapshot referentially stable within each
 * minute, so this costs one render per minute rather than one per tick.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribeToClock, clockSnapshot, clockSnapshot);
}

/* ───────────────────────── Persisted flag ───────────────────────── */

const flagListeners = new Set<() => void>();

function notifyFlagChange() {
  for (const listener of flagListeners) listener();
}

function subscribeToFlags(onChange: () => void): () => void {
  flagListeners.add(onChange);
  // `storage` fires for other tabs, so a preference toggled in one window
  // follows across the rest.
  window.addEventListener('storage', onChange);
  return () => {
    flagListeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * A boolean preference persisted in `localStorage`.
 *
 * Read through `useSyncExternalStore` rather than copied into state by an
 * effect. `localStorage` does not exist on the server, so `getServerSnapshot`
 * returns the default and the client reconciles on hydration — no mismatch, and
 * no cascading render from a `setState` in an effect body.
 */
export function usePersistentFlag(
  storageKey: string,
  defaultValue = false
): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribeToFlags,
    () => {
      const stored = localStorage.getItem(storageKey);
      return stored === null ? defaultValue : stored === '1';
    },
    () => defaultValue
  );

  const set = useCallback(
    (next: boolean) => {
      localStorage.setItem(storageKey, next ? '1' : '0');
      notifyFlagChange();
    },
    [storageKey]
  );

  return [value, set];
}

/* ───────────────────────── Debounce ───────────────────────── */

/** Delays a rapidly changing value, e.g. a search box feeding a query. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
