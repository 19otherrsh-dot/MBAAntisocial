import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';
import { safeEqual } from '../../crypto';

/**
 * Calendar apps cannot send cookies, so the feed URL carries its own
 * credential: an HMAC of the user id and a version. Rotating bumps the version
 * and every old link stops working.
 */
function sign(userId: string, version: number): string {
  return createHmac('sha256', `${env.AUTH_SECRET}:calendar-feed`).update(`${userId}:${version}`).digest('base64url').slice(0, 32);
}

export function feedUrl(userId: string, version: number): string {
  return `${env.APP_URL}/api/calendar/feed/${userId}/${sign(userId, version)}.ics`;
}

export function verifyFeed(userId: string, version: number, signature: string): boolean {
  return safeEqual(sign(userId, version), signature);
}
