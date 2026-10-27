import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import ClassSlot from '@/models/academics/ClassSlot';

export const DELETE = route({ rateLimit: 'write', feature: 'timetable' }, async ({ actor, params }) => {
  const removed = await ClassSlot.findOneAndDelete({ _id: objectId.parse(params.id), user: actor.id });
  if (!removed) throw ApiError.notFound('That class does not exist.');
  return ok({ deleted: true });
});
