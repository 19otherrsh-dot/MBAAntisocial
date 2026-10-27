import { route, ok, created } from '@/lib/api/handler';
import { publishRelease, releaseOverview, releaseSchema } from '@/server/modules/admin/releases';

/** The catalog with each game's live build, and the release history. */
export const GET = route({ requirePlatformAdmin: true }, async () => ok(await releaseOverview()));

/** Publishes a CDN-hosted build; it goes live within a minute, no redeploy. */
export const POST = route({ requirePlatformAdmin: true, body: releaseSchema, rateLimit: 'write' }, async ({ actor, body }) =>
  created(await publishRelease(actor, body))
);
