import type { KeyValueStore } from '../../ports/kv';

interface Entry {
  value: string;
  expiresAt: number;
}

/** Process-local fallback. Correct on one instance; per-instance on several. */
export class MemoryKeyValueStore implements KeyValueStore {
  readonly shared = false;
  private readonly map = new Map<string, Entry>();
  private lastSweep = Date.now();

  private live(key: string): Entry | null {
    const now = Date.now();
    if (now - this.lastSweep > 60_000) {
      this.lastSweep = now;
      for (const [k, e] of this.map) if (e.expiresAt <= now) this.map.delete(k);
    }
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.map.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (this.live(key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async take(key: string) {
    const entry = this.live(key);
    this.map.delete(key);
    return entry?.value ?? null;
  }

  async del(key: string) {
    this.map.delete(key);
  }

  async incr(key: string, ttlSeconds: number) {
    const entry = this.live(key);
    if (!entry) {
      const expiresAt = Date.now() + ttlSeconds * 1000;
      this.map.set(key, { value: '1', expiresAt });
      return { value: 1, ttlMs: ttlSeconds * 1000 };
    }
    const value = Number(entry.value) + 1;
    entry.value = String(value);
    return { value, ttlMs: entry.expiresAt - Date.now() };
  }
}
