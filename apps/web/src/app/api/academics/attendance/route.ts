import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import Course from '@/models/academics/Course';
import AttendanceMark from '@/models/academics/AttendanceMark';
import { markSchema } from '@/server/modules/academics/schemas';

const querySchema = z.object({ course: objectId });

/** A course's marks, newest first. */
export const GET = route({ feature: 'attendance', query: querySchema }, async ({ actor, query }) => {
  const marks = await AttendanceMark.find({ user: actor.id, course: query.course }).sort({ day: -1 }).limit(400).lean();
  return ok({ marks: marks.map((m) => ({ _id: String(m._id), day: m.day, status: m.status, slot: m.slot ? String(m.slot) : null })) });
});

/** Marks (or, with status null, clears) one class. Future days cannot be marked. */
export const POST = route({ body: markSchema, rateLimit: 'write', feature: 'attendance' }, async ({ actor, body }) => {
  if (!(await Course.exists({ _id: body.course, user: actor.id }))) throw ApiError.notFound('That course does not exist.');
  const tomorrow = new Date(Date.now() + 36 * 60 * 60_000).toISOString().slice(0, 10);
  if (body.day > tomorrow) throw ApiError.badRequest('You cannot mark a class that has not happened yet.');
  const key = { user: actor.id, course: body.course, day: body.day, slot: body.slot ?? null };
  if (body.status === null) {
    await AttendanceMark.deleteOne(key);
    return ok({ status: null });
  }
  await AttendanceMark.updateOne(key, { $set: { status: body.status } }, { upsert: true });
  return ok({ status: body.status });
});
