import type { UserRole } from '@mba/shared/constants';
import User from '@/models/User';
import { container } from '@/server/container';

/**
 * The parts of a session that must never go stale: role, campus, and whether
 * the account is suspended or verified.
 *
 * Session and app tokens carry these as claims for up to thirty days. Trusting
 * them would let a demoted moderator keep moderating, or a suspended account
 * keep posting, until the token expired. So every request re-reads them —
 * from a 60-second cache that admin actions clear immediately.
 */
export interface AuthzState {
  role: UserRole;
  campus: string;
  batch: string;
  year: 1 | 2;
  verified: boolean;
  suspended: boolean;
}

const TTL_SECONDS = 60;
const key = (userId: string) => `authz:${userId}`;

export async function currentAuthz(userId: string): Promise<AuthzState | null> {
  const { kv } = container();
  const cached = await kv.get(key(userId)).catch(() => null);
  if (cached) return JSON.parse(cached) as AuthzState;

  const user = await User.findById(userId).select('role campus batch year emailVerifiedAt suspendedAt').lean();
  if (!user) return null;
  const state: AuthzState = {
    role: user.role,
    campus: user.campus,
    batch: user.batch,
    year: user.year,
    verified: Boolean(user.emailVerifiedAt),
    suspended: Boolean(user.suspendedAt),
  };
  await kv.set(key(userId), JSON.stringify(state), TTL_SECONDS).catch(() => undefined);
  return state;
}

/** Call after changing a user's role, campus, verification, or suspension. */
export async function invalidateAuthz(userId: string): Promise<void> {
  await container().kv.del(key(userId)).catch(() => undefined);
}
