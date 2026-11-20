import { z } from 'zod';
import type { QueryFilter } from 'mongoose';
import { route, ok, paginate, pageMeta } from '@/lib/api/handler';
import { objectId } from '@/lib/validation';
import { USER_ROLES } from '@/lib/constants';
import { changeRole, suspend, restore } from '@/lib/admin/people';
import User, { type IUser } from '@/models/User';

const querySchema = z.object({
  search: z.string().trim().max(80).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(['all', 'active', 'suspended']).default('all'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The campus directory for admins: who is here, in what role, in what state. */
export const GET = route({ query: querySchema, requireAdmin: true }, async ({ actor, query }) => {
  const filter: QueryFilter<IUser> = { campus: actor.campus };
  if (query.role) filter.role = query.role;
  if (query.status === 'active') filter.suspendedAt = { $exists: false };
  if (query.status === 'suspended') filter.suspendedAt = { $exists: true };
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const { skip, limit } = paginate(query);
  const [users, total, roleCounts] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('name email image role year batch suspendedAt suspensionReason createdAt lastCheckInAt linkedAccounts.provider')
      .lean(),
    User.countDocuments(filter),
    User.aggregate<{ _id: string; count: number }>([
      { $match: { campus: actor.campus } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
  ]);

  return ok({
    users: users.map((user) => ({
      _id: String(user._id),
      name: user.name,
      email: user.email,
      image: user.image ?? '',
      role: user.role,
      year: user.year,
      batch: user.batch,
      suspended: Boolean(user.suspendedAt),
      suspensionReason: user.suspensionReason ?? '',
      joinedAt: user.createdAt,
      lastActiveAt: user.lastCheckInAt ?? null,
      sso: (user.linkedAccounts ?? []).map((link) => link.provider),
      isYou: String(user._id) === actor.id,
    })),
    roleCounts: Object.fromEntries(roleCounts.map((row) => [row._id, row.count])),
    pagination: pageMeta(query, total),
  });
});

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('set_role'), userId: objectId, role: z.enum(USER_ROLES), reason: z.string().trim().max(500).default('') }),
  z.object({ action: z.literal('suspend'), userId: objectId, reason: z.string().trim().max(500) }),
  z.object({ action: z.literal('restore'), userId: objectId, reason: z.string().trim().max(500).default('') }),
]);

export const PATCH = route({ body: actionSchema, requireAdmin: true, rateLimit: 'write' }, async ({ actor, body }) => {
  if (body.action === 'set_role') await changeRole(actor, body.userId, body.role, body.reason);
  else if (body.action === 'suspend') await suspend(actor, body.userId, body.reason);
  else await restore(actor, body.userId, body.reason);
  return ok({ done: true });
});
