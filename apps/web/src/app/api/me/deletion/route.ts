import { route, ok } from '@/lib/api/handler';
import { deletionBlockers } from '@/server/modules/account/service';

/** What would stop the caller deleting their account right now, so the UI can say before they try. */
export const GET = route({ allowUnverified: true }, async ({ actor }) => ok({ blockers: await deletionBlockers(actor.id) }));
