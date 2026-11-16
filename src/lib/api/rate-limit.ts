import { ApiError } from './errors';

/**
 * Fixed-window rate limiting.
 *
 * With `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` set, counters
 * live in Redis and are shared by every server instance — the limit means what
 * it says however many copies of the app are running. Without them, each
 * instance counts on its own, which still stops one client hammering an
 * endpoint and is fine for a single server or local development.
 *
 * If the shared store is unreachable the request falls back to the local
 * counter rather than failing: an outage of the limiter must not become an
 * outage of the app.
 */
interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

// Reclaim expired windows periodically so the map cannot grow without bound.
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  register: { limit: 5, windowSeconds: 3600 },
  login: { limit: 10, windowSeconds: 900 },
  /** Anything that sends an email to an address the caller typed. */
  authEmail: { limit: 5, windowSeconds: 3600 },
  write: { limit: 60, windowSeconds: 60 },
  post: { limit: 12, windowSeconds: 300 },
  upload: { limit: 20, windowSeconds: 3600 },
  booking: { limit: 20, windowSeconds: 3600 },
  report: { limit: 10, windowSeconds: 3600 },
  /**
   * Calls that cost real money per request. Tighter than everything else
   * because the failure mode is a bill rather than a slow page.
   */
  ai: { limit: 40, windowSeconds: 3600 },
  chat: { limit: 60, windowSeconds: 300 },
  /** Account export and deletion: rare, and expensive. */
  account: { limit: 5, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

interface Hit {
  count: number;
  resetAt: number;
}

function hitLocal(key: string, windowMs: number, now: number): Hit {
  sweep(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return fresh;
  }
  existing.count += 1;
  return existing;
}

/** One round trip: increment this window's counter and give it an expiry. */
async function hitShared(key: string, windowMs: number, now: number): Promise<Hit | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const windowStart = Math.floor(now / windowMs) * windowMs;
  const windowKey = `rl:${key}:${windowStart}`;

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', windowKey],
        ['PEXPIRE', windowKey, String(windowMs)],
      ]),
      signal: AbortSignal.timeout(800),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const [incr] = (await response.json()) as Array<{ result?: number; error?: string }>;
    if (typeof incr?.result !== 'number') throw new Error(incr?.error ?? 'bad reply');
    return { count: incr.result, resetAt: windowStart + windowMs };
  } catch (error) {
    console.warn('[rate-limit] shared store unavailable, counting locally:', (error as Error).message);
    return null;
  }
}

/**
 * Records one hit against `identifier` and throws once the window is exhausted.
 */
export async function consume(name: RateLimitName, identifier: string): Promise<void> {
  const rule = RATE_LIMITS[name];
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const key = `${name}:${identifier}`;

  const hit = (await hitShared(key, windowMs, now)) ?? hitLocal(key, windowMs, now);

  if (hit.count > rule.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((hit.resetAt - now) / 1000));
    throw ApiError.tooManyRequests(
      `Too many requests. Try again in ${formatRetry(retryAfterSeconds)}.`,
      retryAfterSeconds
    );
  }
}

function formatRetry(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * Best-effort client identity for unauthenticated endpoints. Proxy headers are
 * spoofable, so this is only ever used for anonymous throttling — never for
 * authorization. Authenticated routes key on the user id instead.
 */
export function clientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
