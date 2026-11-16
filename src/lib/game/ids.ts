import { createHash } from 'node:crypto';
import { Types } from 'mongoose';

/**
 * A stable ObjectId derived from a string, for rewards that have no document of
 * their own — "today's chest", "quest X on day Y", "path step Z".
 *
 * The ledger's unique (user, action, entity) index is what makes a reward pay
 * exactly once. Keying it on a deterministic id means a claim can be retried,
 * double-tapped, or raced from two tabs, and still pays once.
 */
export function stableId(key: string): Types.ObjectId {
  return new Types.ObjectId(createHash('sha1').update(key).digest('hex').slice(0, 24));
}
