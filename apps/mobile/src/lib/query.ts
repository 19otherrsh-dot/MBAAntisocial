import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from './api';

interface QueryState<T> {
  data: T | null;
  error: string | null;
  /** True until the first response (or error) for the current path. */
  loading: boolean;
  /** For pull-to-refresh: true only while a user-initiated refetch runs. */
  refreshing: boolean;
  refetch: () => void;
}

/** GET a path, keeping the last good data on screen while refetching. */
export function useQuery<T>(path: string | null): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api
      .get<T>(path)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
      })
      .catch((caught) => !cancelled && setError(errorText(caught)))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const refetch = useCallback(() => {
    setRefreshing(true);
    setNonce((n) => n + 1);
  }, []);

  return { data, error, loading: Boolean(path) && data === null && error === null, refreshing, refetch };
}
