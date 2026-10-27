import { route, ok } from '@/lib/api/handler';
import { listCampuses } from '@/server/modules/admin/campuses';

/** Every campus with its lifecycle state and progress toward the Campus Edition. */
export const GET = route({ requirePlatformAdmin: true }, async () => ok({ campuses: await listCampuses() }));
