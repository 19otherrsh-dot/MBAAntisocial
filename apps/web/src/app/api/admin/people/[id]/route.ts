import { route, ok } from '@/lib/api/handler';
import { objectId } from '@/lib/validation';
import { personPatchSchema, updatePerson } from '@/server/modules/admin/people';

/** Change anyone's role, or suspend and reinstate them. */
export const PATCH = route({ requirePlatformAdmin: true, body: personPatchSchema, rateLimit: 'write' }, async ({ actor, body, params }) =>
  ok({ person: await updatePerson(actor, objectId.parse(params.id), body, 'platform') })
);
