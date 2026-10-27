import { ApiError } from './errors';
import { container } from '@/server/container';

/**
 * Fixed-window rate limiter on the key-value port.
 *
 * With `REDIS_URL` set the counters live in Redis, so a limit is a limit
 * however many instances serve traffic. Without it the in-process fallback
 * still stops a single client hammering one instance — which is the failure
 * the write paths actually need protecting from in development.
 */
export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export const RATE_LIMITS = {
  register: { limit: 5, windowSeconds: 3600 },
  login: { limit: 10, windowSeconds: 900 },
  otp: { limit: 5, windowSeconds: 900 },
  verify: { limit: 10, windowSeconds: 900 },
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
  hub: { limit: 120, windowSeconds: 60 },
  game: { limit: 60, windowSeconds: 60 },
  search: { limit: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Records one hit against `identifier` and throws once the window is exhausted.
 */
export async function consume(name: RateLimitName, identifier: string): Promise<void> {
  const rule = RATE_LIMITS[name];
  let result: { value: number; ttlMs: number };
  try {
    result = await container().kv.incr(`rl:${name}:${identifier}`, rule.windowSeconds);
  } catch (error) {
    // A broken limiter must not take the product down with it.
    console.error('[rate-limit] store unavailable:', error instanceof Error ? error.message : error);
    return;
  }

  if (result.value > rule.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil(result.ttlMs / 1000));
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
