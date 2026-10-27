import { ApiError } from './errors';

/**
 * Fixed-window rate limiter backed by an in-process map.
 *
 * This is intentionally simple and has a known limitation: each serverless
 * instance keeps its own counters, so the effective limit scales with instance
 * count. It is sufficient to stop a single client hammering an endpoint, which
 * is what the write paths here need. Moving to a shared store (Redis, Upstash)
 * is a drop-in change behind `consume` when the deployment goes multi-instance.
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
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Records one hit against `identifier` and throws once the window is exhausted.
 */
export function consume(name: RateLimitName, identifier: string): void {
  const rule = RATE_LIMITS[name];
  const now = Date.now();
  sweep(now);

  const key = `${name}:${identifier}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return;
  }

  existing.count += 1;

  if (existing.count > rule.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
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
