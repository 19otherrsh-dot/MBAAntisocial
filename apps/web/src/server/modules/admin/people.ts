import { z } from 'zod';
import { USER_ROLES, ROLE_META, type UserRole } from '@mba/shared/constants';
import type { Actor } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import User from '@/models/User';
import { invalidateAuthz } from '@/server/modules/auth/authz';
import { audit, diff } from './audit';

const changedOnly = (before: Record<string, unknown>, after: Record<string, unknown>) => {
  const { before: was, after: now } = diff(before, after);
  return { before: was, after: now };
};

/** Roles a campus admin may hand out within their campus. */
export const CAMPUS_ASSIGNABLE_ROLES: readonly UserRole[] = ['student', 'mentor', 'alumni', 'moderator', 'placement_office'];
/** Roles only a platform admin may grant or take away. */
const PROTECTED_ROLES: readonly UserRole[] = ['campus_admin', 'admin'];

export const personPatchSchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    suspended: z.boolean().optional(),
    reason: z.string().trim().max(500).default(''),
  })
  .refine((p) => p.role !== undefined || p.suspended !== undefined, { message: 'Nothing to change.' });

export const peopleQuerySchema = z.object({
  q: z.string().trim().max(80).default(''),
  campus: z.string().trim().max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  suspended: z.enum(['true', 'false']).optional(),
});

interface Who {
  id: string;
  campus: string;
  role: UserRole;
}

/**
 * Who may do what to whom. Pure, so it is tested on its own:
 * - nobody changes their own role or suspends themselves;
 * - a platform admin may change anyone else;
 * - a campus admin works only inside their campus, only on people below
 *   campus admin, and only with the roles a campus can grant.
 * Returns the reason it is refused, or null when allowed.
 */
export function refusal(actor: Who & { scope: 'platform' | 'campus' }, target: Who, change: { role?: UserRole; suspended?: boolean }): string | null {
  if (actor.id === target.id) return 'You cannot change your own role or suspend yourself.';
  if (actor.scope === 'platform') return null;
  if (target.campus !== actor.campus) return 'That person is not on your campus.';
  if (PROTECTED_ROLES.includes(target.role)) return 'Only the platform team can change a campus admin.';
  if (change.role && !CAMPUS_ASSIGNABLE_ROLES.includes(change.role)) return `Only the platform team can make someone ${ROLE_META[change.role].label.toLowerCase()}.`;
  return null;
}

const PERSON_FIELDS = 'name email image campus batch year role suspendedAt emailVerifiedAt createdAt lastCheckInAt';

function serialisePerson(u: {
  _id: unknown;
  name: string;
  email: string;
  image?: string;
  campus: string;
  batch: string;
  year: number;
  role: UserRole;
  suspendedAt?: Date;
  emailVerifiedAt?: Date;
  createdAt: Date;
  lastCheckInAt?: Date;
}) {
  return {
    _id: String(u._id),
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    campus: u.campus,
    batch: u.batch,
    year: u.year,
    role: u.role,
    suspended: Boolean(u.suspendedAt),
    verified: Boolean(u.emailVerifiedAt),
    joinedAt: u.createdAt,
    lastActiveAt: u.lastCheckInAt ?? null,
  };
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function searchPeople(query: z.infer<typeof peopleQuerySchema>, scopeCampus: string | null) {
  const filter: Record<string, unknown> = {};
  const campus = scopeCampus ?? query.campus;
  if (campus) filter.campus = campus;
  if (query.role) filter.role = query.role;
  if (query.suspended) filter.suspendedAt = { $exists: query.suspended === 'true' };
  if (query.q) {
    const pattern = new RegExp(escape(query.q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }
  const rows = await User.find(filter).sort({ role: 1, name: 1 }).limit(50).select(PERSON_FIELDS).lean();
  return rows.map(serialisePerson);
}

export async function updatePerson(actor: Actor, targetId: string, patch: z.infer<typeof personPatchSchema>, scope: 'platform' | 'campus') {
  const target = await User.findById(targetId).select(PERSON_FIELDS);
  // Off-campus people are invisible to a campus admin, not "forbidden".
  if (!target || (scope === 'campus' && target.campus !== actor.campus)) throw ApiError.notFound('That person does not exist.');

  const why = refusal({ id: actor.id, campus: actor.campus, role: actor.role, scope }, { id: String(target._id), campus: target.campus, role: target.role }, patch);
  if (why) throw ApiError.forbidden(why);

  const before = { role: target.role, suspended: Boolean(target.suspendedAt) };
  if (patch.role !== undefined) target.role = patch.role;
  if (patch.suspended === true && !target.suspendedAt) target.suspendedAt = new Date();
  if (patch.suspended === false) target.suspendedAt = undefined;
  const after = { role: target.role, suspended: Boolean(target.suspendedAt) };
  if (before.role === after.role && before.suspended === after.suspended) return serialisePerson(target.toObject());

  if (after.suspended && !patch.reason) throw ApiError.unprocessable('Say why — the reason is kept in the audit log.');
  await target.save();
  // Takes effect on their very next request, not when their session expires.
  await invalidateAuthz(String(target._id));

  const action = before.suspended !== after.suspended ? (after.suspended ? 'user.suspend' : 'user.reinstate') : 'user.role';
  await audit(actor.id, {
    action,
    targetType: 'user',
    targetId: String(target._id),
    targetLabel: `${target.name} <${target.email}>`,
    campus: target.campus,
    ...changedOnly(before, after),
    reason: patch.reason,
  });
  return serialisePerson(target.toObject());
}
