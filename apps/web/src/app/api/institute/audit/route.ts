import { route, ok } from '@/lib/api/handler';
import { listAudit } from '@/server/modules/admin/audit';

/** Privileged changes on the caller's campus. */
export const GET = route({ requireCampusAdmin: true }, async ({ actor }) => ok({ entries: await listAudit(actor.campus) }));
