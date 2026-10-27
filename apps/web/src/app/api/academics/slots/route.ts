import { overlaps } from '@mba/shared/academics';
import { route, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import Course from '@/models/academics/Course';
import ClassSlot from '@/models/academics/ClassSlot';
import { slotSchema } from '@/server/modules/academics/schemas';

/** Adds a weekly class. Overlaps are allowed (electives clash) but reported. */
export const POST = route({ body: slotSchema, rateLimit: 'write', feature: 'timetable' }, async ({ actor, body }) => {
  if (!(await Course.exists({ _id: body.course, user: actor.id }))) throw ApiError.notFound('That course does not exist.');
  if ((await ClassSlot.countDocuments({ user: actor.id })) >= 120) throw ApiError.unprocessable('That is a lot of classes. Remove old ones first.');
  const sameDay = await ClassSlot.find({ user: actor.id, day: body.day }).populate<{ course: { name: string } }>('course', 'name').lean();
  const clash = sameDay.find((s) => overlaps(s, body));
  const slot = await ClassSlot.create({ ...body, user: actor.id });
  return created({ slot: { ...slot.toObject(), _id: String(slot._id), course: String(slot.course) }, clash: clash ? clash.course?.name ?? 'another class' : null });
});
