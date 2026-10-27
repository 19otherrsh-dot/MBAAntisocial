/**
 * A tiny key-value port. Redis in production so counters and one-time codes
 * are shared across instances; an in-process map otherwise.
 */
export interface KeyValueStore {
  readonly shared: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Sets only if absent. Returns true when this call created the key. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** Atomically reads and deletes, for single-use codes. */
  take(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  /** Increments, setting the TTL when the key is created. Returns the new value and ms to expiry. */
  incr(key: string, ttlSeconds: number): Promise<{ value: number; ttlMs: number }>;
}
