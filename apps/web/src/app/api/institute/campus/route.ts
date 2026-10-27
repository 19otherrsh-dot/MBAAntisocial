import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import Campus from '@/models/Campus';
import { campusDensity } from '@/server/modules/campus/service';
import { campusProfileSchema, serialiseCampusProfile, updateCampus } from '@/server/modules/admin/campuses';

/** The caller's campus as its admin sees it, with progress toward unlocking. */
export const GET = route({ requireCampusAdmin: true }, async ({ actor }) => {
  const campus = await Campus.findOne({ name: actor.campus }).lean();
  if (!campus) throw ApiError.notFound('Your campus is not in the registry yet.');
  return ok({ campus: serialiseCampusProfile(campus), density: await campusDensity(campus.name) });
});

/** Profile, settings, and the counselling block. Identity and lifecycle stay with the platform team. */
export const PATCH = route({ requireCampusAdmin: true, body: campusProfileSchema.extend({}).strict(), rateLimit: 'write' }, async ({ actor, body }) => {
  const campus = await Campus.findOne({ name: actor.campus }).select('_id').lean();
  if (!campus) throw ApiError.notFound('Your campus is not in the registry yet.');
  return ok({ campus: await updateCampus(actor, String(campus._id), { ...body, reason: '' }, 'campus') });
});
