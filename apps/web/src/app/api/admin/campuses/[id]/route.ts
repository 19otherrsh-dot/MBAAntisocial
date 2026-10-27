import { route, ok } from '@/lib/api/handler';
import { objectId } from '@/lib/validation';
import { campusAdminSchema, updateCampus } from '@/server/modules/admin/campuses';

/** Approve, unlock, suspend, or edit a campus. Every change is audited. */
export const PATCH = route({ requirePlatformAdmin: true, body: campusAdminSchema, rateLimit: 'write' }, async ({ actor, body, params }) =>
  ok({ campus: await updateCampus(actor, objectId.parse(params.id), body, 'platform') })
);
