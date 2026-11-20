import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import { objectId } from '@/lib/validation';
import { compInputSchema, createComp, updateComp, archiveComp } from '@/lib/admin/comps';
import CaseComp from '@/models/CaseComp';

/** This campus's own calendar entries, including archived ones. */
export const GET = route({ requireAdmin: true }, async ({ actor }) => {
  const comps = await CaseComp.find({ campuses: actor.campus })
    .sort({ archivedAt: 1, registrationDeadline: 1 })
    .select('-savedBy')
    .lean();
  const saves = await CaseComp.aggregate<{ _id: unknown; saves: number }>([
    { $match: { campuses: actor.campus } },
    { $project: { saves: { $size: { $ifNull: ['$savedBy', []] } } } },
  ]);
  const saveCount = new Map(saves.map((row) => [String(row._id), row.saves]));
  return ok({ comps: comps.map((comp) => ({ ...comp, _id: String(comp._id), saves: saveCount.get(String(comp._id)) ?? 0 })) });
});

export const POST = route({ body: compInputSchema, requireAdmin: true, rateLimit: 'write' }, async ({ actor, body }) => {
  const comp = await createComp(actor, body);
  return created({ comp: { ...comp.toObject(), _id: String(comp._id) } });
});

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), compId: objectId, comp: compInputSchema }),
  z.object({ action: z.literal('archive'), compId: objectId }),
]);

export const PATCH = route({ body: patchSchema, requireAdmin: true, rateLimit: 'write' }, async ({ actor, body }) => {
  const comp = body.action === 'update' ? await updateComp(actor, body.compId, body.comp) : await archiveComp(actor, body.compId);
  return ok({ comp: { _id: String(comp._id), archivedAt: comp.archivedAt ?? null } });
});
