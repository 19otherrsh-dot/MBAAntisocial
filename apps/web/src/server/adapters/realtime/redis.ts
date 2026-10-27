import type Redis from 'ioredis';
import {
  PRESENCE_KEY_PREFIX,
  REALTIME_REDIS_CHANNEL,
  type RealtimeEnvelope,
  type RealtimeEventName,
  type RealtimeEvents,
} from '@mba/shared/realtime';
import type { RealtimePublisher } from '../../ports/realtime';

/**
 * Publishes envelopes on one Redis channel. Every realtime instance subscribes
 * and emits to its local sockets in the matching topic, so the web app never
 * needs to know how many instances exist or which one holds a socket.
 */
export class RedisRealtimePublisher implements RealtimePublisher {
  readonly id = 'redis';
  constructor(private readonly redis: Redis) {}

  async publish<E extends RealtimeEventName>(topic: string, event: E, data: RealtimeEvents[E]) {
    const envelope: RealtimeEnvelope<E> = { topic, event, data, at: new Date().toISOString() };
    try {
      await this.redis.publish(REALTIME_REDIS_CHANNEL, JSON.stringify(envelope));
    } catch (error) {
      console.error('[realtime] publish failed:', error instanceof Error ? error.message : error);
    }
  }

  async online(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    try {
      const values = await this.redis.mget(userIds.map((id) => PRESENCE_KEY_PREFIX + id));
      return new Set(userIds.filter((_, i) => values[i] && Number(values[i]) > 0));
    } catch {
      return new Set();
    }
  }
}
