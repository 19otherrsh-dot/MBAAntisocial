import Redis from 'ioredis';
import { env } from '@/lib/env';

/**
 * One Redis connection per process, cached on `globalThis` for the same reason
 * as the Mongo pool: hot reload and many route modules would otherwise each
 * open their own.
 */
declare global {
  var redisClient: Redis | null | undefined;
}

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (globalThis.redisClient) return globalThis.redisClient;

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on('error', (error) => {
    // Logged, not thrown: every caller treats Redis as best-effort or has a fallback.
    console.error('[redis]', error.message);
  });
  globalThis.redisClient = client;
  return client;
}
