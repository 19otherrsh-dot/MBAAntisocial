import { timingSafeEqual } from 'node:crypto';

/**
 * Authorises a scheduled-job request: `Authorization: Bearer <CRON_SECRET>`,
 * which is what Vercel Cron and the GitHub Actions scheduler both send.
 *
 * Constant-time: `!==` on a secret returns at the first differing byte, and
 * the timing leaks how much of a guess was right.
 */
export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization');
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
