import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import User from '@/models/User';
import ClassSlot from '@/models/academics/ClassSlot';
import { courseOverview, todaysClasses } from '@/server/modules/academics/service';

const querySchema = z.object({ term: z.string().max(40).optional() });

/** Courses with attendance and grade outlooks, the weekly timetable, and today's classes. */
export const GET = route({ feature: 'timetable', query: querySchema }, async ({ actor, query }) => {
  const user = await User.findById(actor.id).select('timezone academicSettings').lean();
  const timeZone = user?.timezone || 'Asia/Kolkata';
  const scale = user?.academicSettings?.gradeScale ?? '4.33';
  const term = query.term ?? user?.academicSettings?.currentTerm ?? undefined;
  const [overview, slots, today] = await Promise.all([
    courseOverview(actor.id, scale, term || undefined),
    ClassSlot.find({ user: actor.id }).sort({ day: 1, start: 1 }).lean(),
    todaysClasses(actor.id, timeZone),
  ]);
  const courseIds = new Set(overview.courses.map((c) => c._id));
  return ok({
    ...overview,
    settings: { gradeScale: scale, currentTerm: user?.academicSettings?.currentTerm ?? '' },
    slots: slots.filter((s) => courseIds.has(String(s.course))).map((s) => ({ ...s, _id: String(s._id), course: String(s.course), user: undefined })),
    today,
  });
});
