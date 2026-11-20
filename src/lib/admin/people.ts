import User from '@/models/User';
import { ApiError } from '@/lib/api/errors';
import { recordAudit } from '@/lib/audit';
import { ADMIN_ROLES, MODERATOR_ROLES, STAFF_ROLES, type UserRole } from '@/lib/constants';
import type { Actor } from '@/lib/api/handler';

/**
 * People management for institute admins. Every rule that protects the campus
 * from a mistaken or malicious admin lives here, beside the audit write, so no
 * route can change a role without both.
 */

function auditActor(actor: Actor) {
  return { id: actor.id, campus: actor.campus, name: actor.name, role: actor.role };
}

async function loadTarget(actor: Actor, userId: string) {
  // Campus-scoped: an admin can only see and act on their own campus.
  const user = await User.findOne({ _id: userId, campus: actor.campus }).select('name role suspendedAt year');
  if (!user) throw ApiError.notFound('That person is not on your campus.');
  return user;
}

async function assertNotLastAdmin(campus: string, userId: string) {
  const others = await User.countDocuments({
    campus,
    role: { $in: ADMIN_ROLES },
    suspendedAt: { $exists: false },
    _id: { $ne: userId },
  });
  if (others === 0) {
    throw ApiError.conflict('This is the campus’s last admin. Make someone else an admin first.');
  }
}

export async function changeRole(actor: Actor, userId: string, role: UserRole, reason: string): Promise<void> {
  if (userId === actor.id) {
    throw ApiError.badRequest('You cannot change your own role. Ask another admin.');
  }
  const user = await loadTarget(actor, userId);
  if (user.role === role) return;

  if (ADMIN_ROLES.includes(user.role) && !ADMIN_ROLES.includes(role)) {
    await assertNotLastAdmin(actor.campus, userId);
  }

  const before = user.role;
  user.role = role;
  await user.save();

  await recordAudit({
    actor: auditActor(actor),
    action: 'role.changed',
    target: { type: 'user', id: userId, label: user.name },
    detail: {
      from: before,
      to: role,
      reason,
      grantsModeration: MODERATOR_ROLES.includes(role),
      grantsReport: STAFF_ROLES.includes(role),
    },
  });
}

export async function suspend(actor: Actor, userId: string, reason: string): Promise<void> {
  if (userId === actor.id) throw ApiError.badRequest('You cannot suspend yourself.');
  if (!reason.trim()) {
    throw ApiError.unprocessable('Some fields need fixing.', { reason: 'Say why. It is kept in the audit log.' });
  }
  const user = await loadTarget(actor, userId);
  if (user.suspendedAt) return;
  if (ADMIN_ROLES.includes(user.role)) await assertNotLastAdmin(actor.campus, userId);

  // Takes effect on the person's next request: the route wrapper reads this flag live.
  await User.updateOne(
    { _id: userId },
    { $set: { suspendedAt: new Date(), suspendedBy: actor.id, suspensionReason: reason.slice(0, 500) } }
  );
  await recordAudit({
    actor: auditActor(actor),
    action: 'user.suspended',
    target: { type: 'user', id: userId, label: user.name },
    detail: { reason },
  });
}

export async function restore(actor: Actor, userId: string, reason: string): Promise<void> {
  const user = await loadTarget(actor, userId);
  if (!user.suspendedAt) return;
  await User.updateOne(
    { _id: userId },
    { $unset: { suspendedAt: 1, suspendedBy: 1 }, $set: { suspensionReason: '' } }
  );
  await recordAudit({
    actor: auditActor(actor),
    action: 'user.restored',
    target: { type: 'user', id: userId, label: user.name },
    detail: { reason },
  });
}
