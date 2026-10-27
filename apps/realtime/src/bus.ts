import { Redis } from 'ioredis';
import { REALTIME_REDIS_CHANNEL, type RealtimeEnvelope } from '@mba/shared/realtime';
import { config } from './config.js';

/**
 * Cross-instance message bus. With Redis every instance hears every message
 * and delivers to its own sockets; without it (one dev instance) messages
 * loop back in-process. Callers cannot tell the difference.
 */
export const SIGNAL_CHANNEL = 'mba:realtime:signals';
export const GAME_CHANNEL_PREFIX = 'mba:game:';

type Listener = (channel: string, message: string) => void;

export interface Bus {
  readonly shared: boolean;
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string): Promise<void>;
  psubscribe(pattern: string): Promise<void>;
  onMessage(listener: Listener): void;
  redis: Redis | null;
}

class RedisBus implements Bus {
  readonly shared = true;
  private readonly sub: Redis;
  readonly redis: Redis;
  private listeners: Listener[] = [];

  constructor(url: string) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 2 });
    this.sub = new Redis(url, { maxRetriesPerRequest: null });
    this.redis.on('error', (e) => console.error('[redis]', e.message));
    this.sub.on('error', (e) => console.error('[redis:sub]', e.message));
    this.sub.on('message', (channel, message) => this.listeners.forEach((l) => l(channel, message)));
    this.sub.on('pmessage', (_pattern, channel, message) => this.listeners.forEach((l) => l(channel, message)));
  }

  async publish(channel: string, message: string) {
    await this.redis.publish(channel, message);
  }
  async subscribe(channel: string) {
    await this.sub.subscribe(channel);
  }
  async psubscribe(pattern: string) {
    await this.sub.psubscribe(pattern);
  }
  onMessage(listener: Listener) {
    this.listeners.push(listener);
  }
}

class LocalBus implements Bus {
  readonly shared = false;
  readonly redis = null;
  private listeners: Listener[] = [];
  async publish(channel: string, message: string) {
    queueMicrotask(() => this.listeners.forEach((l) => l(channel, message)));
  }
  async subscribe() {}
  async psubscribe() {}
  onMessage(listener: Listener) {
    this.listeners.push(listener);
  }
}

export function createBus(): Bus {
  if (config.REDIS_URL) return new RedisBus(config.REDIS_URL);
  console.warn('[realtime] REDIS_URL not set — running single-instance, and the web app cannot publish to this instance.');
  return new LocalBus();
}

export function isEnvelope(value: unknown): value is RealtimeEnvelope {
  return Boolean(value && typeof value === 'object' && 'topic' in value && 'event' in value);
}

export { REALTIME_REDIS_CHANNEL };
