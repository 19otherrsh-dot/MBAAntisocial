import { route, ok } from '@/lib/api/handler';
import { buildToday } from '@/server/modules/today/service';

/** Everything the Today screen shows, in one round trip. */
export const GET = route({}, async ({ actor }) => ok(await buildToday(actor)));
