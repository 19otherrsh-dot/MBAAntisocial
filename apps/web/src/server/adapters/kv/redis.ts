import type Redis from 'ioredis';
import type { KeyValueStore } from '../../ports/kv';

const PREFIX = 'mba:kv:';

export class RedisKeyValueStore implements KeyValueStore {
  readonly shared = true;
  constructor(private readonly redis: Redis) {}

  async get(key: string) {
    return this.redis.get(PREFIX + key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(PREFIX + key, value, 'EX', ttlSeconds);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    const result = await this.redis.set(PREFIX + key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async take(key: string) {
    return this.redis.getdel(PREFIX + key);
  }

  async del(key: string) {
    await this.redis.del(PREFIX + key);
  }

  async incr(key: string, ttlSeconds: number) {
    const k = PREFIX + key;
    // MULTI so the counter can never be left without an expiry.
    const results = await this.redis.multi().incr(k).expire(k, ttlSeconds, 'NX').pttl(k).exec();
    const value = Number(results?.[0]?.[1] ?? 1);
    const ttlMs = Number(results?.[2]?.[1] ?? ttlSeconds * 1000);
    return { value, ttlMs: ttlMs > 0 ? ttlMs : ttlSeconds * 1000 };
  }
}
