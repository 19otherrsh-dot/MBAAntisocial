import { createHash, randomBytes } from 'node:crypto';

/**
 * Single-use tokens for emailed links (address confirmation, password reset).
 *
 * The raw token goes in the email and nowhere else. Only its SHA-256 is stored,
 * so a read of the database — a backup, a leaked dump, a curious operator —
 * does not hand over the ability to take over accounts. The token is 256 bits
 * of randomness, so an unsalted fast hash is sufficient: there is nothing to
 * brute-force.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function issueToken(ttlMs: number): { raw: string; tokenHash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) };
}

export const VERIFY_EMAIL_TTL_MS = 48 * 3_600_000;
export const PASSWORD_RESET_TTL_MS = 3_600_000;
