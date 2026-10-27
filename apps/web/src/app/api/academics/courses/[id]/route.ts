import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import Course from '@/models/academics/Course';
import ClassSlot from '@/models/academics/ClassSlot';
import AttendanceMark from '@/models/academics/AttendanceMark';
import { courseUpdateSchema } from '@/server/modules/academics/schemas';
import { serialiseCourse, validateWeights } from '@/server/modules/academics/service';

export const PATCH = route({ body: courseUpdateSchema, rateLimit: 'write', feature: 'timetable' }, async ({ actor, params, body }) => {
  validateWeights(body.components);
  const course = await Course.findOneAndUpdate({ _id: objectId.parse(params.id), user: actor.id }, { $set: body }, { new: true }).lean();
  if (!course) throw ApiError.notFound('That course does not exist.');
  return ok({ course: serialiseCourse(course) });
});

/** Removes the course with its timetable slots and attendance marks. */
export const DELETE = route({ rateLimit: 'write', feature: 'timetable' }, async ({ actor, params }) => {
  const id = objectId.parse(params.id);
  const course = await Course.findOneAndDelete({ _id: id, user: actor.id });
  if (!course) throw ApiError.notFound('That course does not exist.');
  await Promise.all([ClassSlot.deleteMany({ course: id, user: actor.id }), AttendanceMark.deleteMany({ course: id, user: actor.id })]);
  return ok({ deleted: true });
});
