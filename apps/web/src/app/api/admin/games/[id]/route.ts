import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { objectId } from '@/lib/validation';
import { setReleaseActive } from '@/server/modules/admin/releases';

const schema = z.object({ active: z.boolean(), reason: z.string().trim().max(500).default('') });

/** Roll a release back (or forward again). */
export const PATCH = route({ requirePlatformAdmin: true, body: schema, rateLimit: 'write' }, async ({ actor, body, params }) =>
  ok(await setReleaseActive(actor, objectId.parse(params.id), body.active, body.reason))
);
