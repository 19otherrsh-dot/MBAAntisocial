import { route, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import Course from '@/models/academics/Course';
import { courseSchema } from '@/server/modules/academics/schemas';
import { serialiseCourse, validateWeights } from '@/server/modules/academics/service';

const MAX_COURSES = 60;

export const POST = route({ body: courseSchema, rateLimit: 'write', feature: 'timetable' }, async ({ actor, body }) => {
  if ((await Course.countDocuments({ user: actor.id, archived: false })) >= MAX_COURSES) throw ApiError.unprocessable('Archive old terms before adding more courses.');
  validateWeights(body.components);
  const course = await Course.create({ ...body, user: actor.id });
  return created({ course: serialiseCourse(course.toObject()) });
});
