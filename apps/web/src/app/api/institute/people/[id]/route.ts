import { route, ok } from '@/lib/api/handler';
import { objectId } from '@/lib/validation';
import { personPatchSchema, updatePerson } from '@/server/modules/admin/people';

/** Roles within the campus (up to moderator and placement office), and suspension. */
export const PATCH = route({ requireCampusAdmin: true, body: personPatchSchema, rateLimit: 'write' }, async ({ actor, body, params }) =>
  ok({ person: await updatePerson(actor, objectId.parse(params.id), body, actor.isPlatformAdmin ? 'platform' : 'campus') })
);
