import { z } from 'zod';
import { CAMPUS_STATUSES, isPersonalEmailDomain } from '@mba/shared/campus';
import type { Actor } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import Campus, { type ICampus } from '@/models/Campus';
import { announceUnlock, campusDensity, invalidateCampusEdition } from '@/server/modules/campus/service';
import { audit, diff } from './audit';

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Use a bare domain like iima.ac.in.');

const settingsSchema = z.object({
  crossCampusMentors: z.boolean(),
  crossCampusFeed: z.boolean(),
  whispers: z.boolean(),
  games: z.boolean(),
  discordGuildId: z.string().trim().regex(/^\d{0,22}$/, 'A Discord server id is a number.'),
});

const supportSchema = z.object({
  counsellorName: z.string().trim().max(100),
  counsellorContact: z.string().trim().max(200),
  hours: z.string().trim().max(100),
  bookingUrl: z.union([z.literal(''), z.string().trim().url().max(300)]),
  emergencyContact: z.string().trim().max(200),
});

/** What a campus admin may change about their own campus. */
export const campusProfileSchema = z.object({
  shortName: z.string().trim().max(30).optional(),
  city: z.string().trim().max(80).optional(),
  website: z.union([z.literal(''), z.string().trim().url().max(200)]).optional(),
  settings: settingsSchema.partial().optional(),
  support: supportSchema.partial().optional(),
});

/** Platform admins can also change identity, domains, and lifecycle. */
export const campusAdminSchema = campusProfileSchema.extend({
  name: z.string().trim().min(2).max(120).optional(),
  domains: z.array(domain).min(1).max(10).optional(),
  status: z.enum(CAMPUS_STATUSES).optional(),
  reason: z.string().trim().max(500).default(''),
});

export async function listCampuses() {
  const campuses = await Campus.find().sort({ status: 1, name: 1 }).lean();
  const densities = await Promise.all(campuses.map((c) => campusDensity(c.name)));
  return campuses.map((c, i) => ({
    _id: String(c._id),
    name: c.name,
    shortName: c.shortName,
    slug: c.slug,
    domains: c.domains,
    city: c.city,
    status: c.status,
    requestNote: c.requestNote,
    createdAt: c.createdAt,
    unlockedAt: c.unlockedAt ?? null,
    settings: { ...DEFAULT_SETTINGS, ...(c.settings ?? {}) },
    density: densities[i],
  }));
}

const DEFAULT_SETTINGS = { crossCampusMentors: true, crossCampusFeed: false, whispers: true, games: true, discordGuildId: '' };
const DEFAULT_SUPPORT = { counsellorName: '', counsellorContact: '', hours: '', bookingUrl: '', emergencyContact: '' };

/** Lean reads skip schema defaults, and older campus rows predate some blocks: fill them in. */
export function serialiseCampusProfile(c: Pick<ICampus, '_id' | 'name' | 'shortName' | 'city' | 'website' | 'domains' | 'status' | 'settings' | 'support'>) {
  return {
    _id: String(c._id),
    name: c.name,
    shortName: c.shortName ?? '',
    city: c.city ?? '',
    website: c.website ?? '',
    domains: c.domains,
    status: c.status,
    settings: { ...DEFAULT_SETTINGS, ...(c.settings ?? {}) },
    support: { ...DEFAULT_SUPPORT, ...(c.support ?? {}) },
  };
}

/**
 * Applies a change to one campus and records it. Status changes carry their
 * side effects: approval stamps who approved, unlocking announces it to
 * members, and every change clears the cached edition.
 */
export async function updateCampus(actor: Actor, campusId: string, patch: z.infer<typeof campusAdminSchema>, scope: 'platform' | 'campus') {
  const campus = await Campus.findById(campusId);
  if (!campus) throw ApiError.notFound('That campus does not exist.');
  if (scope === 'campus' && campus.name !== actor.campus) throw ApiError.notFound('That campus does not exist.');

  const { reason, settings, support, ...fields } = patch;
  if (scope === 'campus') {
    // Belt and braces: the route's schema already strips these.
    delete fields.name;
    delete fields.domains;
    delete fields.status;
  }

  if (fields.domains) {
    for (const d of fields.domains) {
      if (isPersonalEmailDomain(d)) throw ApiError.unprocessable(`${d} is a public email provider, not an institute domain.`);
      const clash = await Campus.findOne({ _id: { $ne: campus._id }, domains: d }).select('name').lean();
      if (clash) throw ApiError.conflict(`${d} already belongs to ${clash.name}.`);
    }
  }
  if (fields.name && fields.name !== campus.name) {
    // The campus name is the join key on every record; renaming is a migration, not an edit.
    throw ApiError.unprocessable('Renaming a campus needs a data migration. Change the short name instead.');
  }

  const before = campus.toObject() as unknown as Record<string, unknown>;
  const flat: Record<string, unknown> = { ...fields };
  for (const [k, v] of Object.entries(settings ?? {})) flat[`settings.${k}`] = v;
  for (const [k, v] of Object.entries(support ?? {})) flat[`support.${k}`] = v;

  const beforeFlat: Record<string, unknown> = { ...before };
  for (const k of Object.keys(settings ?? {})) beforeFlat[`settings.${k}`] = (before.settings as Record<string, unknown>)?.[k];
  for (const k of Object.keys(support ?? {})) beforeFlat[`support.${k}`] = (before.support as Record<string, unknown>)?.[k];
  const change = diff(beforeFlat, flat);
  if (!change.changed) return serialiseCampusProfile(campus.toObject());

  const previousStatus = campus.status;
  const set: Record<string, unknown> = { ...change.after };
  if (fields.status === 'open' && previousStatus === 'requested') Object.assign(set, { approvedBy: actor.id, approvedAt: new Date() });
  if (fields.status === 'campus' && previousStatus !== 'campus') set.unlockedAt = new Date();
  if (fields.status === 'suspended') set.suspendedReason = reason;

  await Campus.updateOne({ _id: campus._id }, { $set: set });
  await invalidateCampusEdition(campus.name);
  if (fields.status === 'campus' && previousStatus !== 'campus') await announceUnlock(campus.name).catch(() => undefined);

  await audit(actor.id, {
    action: fields.status && fields.status !== previousStatus ? `campus.${fields.status}` : 'campus.update',
    targetType: 'campus',
    targetId: String(campus._id),
    targetLabel: campus.name,
    campus: campus.name,
    before: change.before,
    after: change.after,
    reason,
  });

  return serialiseCampusProfile((await Campus.findById(campus._id).lean())!);
}
