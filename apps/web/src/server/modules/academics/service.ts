import { Types } from 'mongoose';
import {
  GRADE_SCALES,
  attendanceOutlook,
  gpa,
  neededOnRemaining,
  summariseComponents,
  weekdayIndex,
  type GradeScaleKey,
} from '@mba/shared/academics';
import { ApiError } from '@/lib/api/errors';
import Course, { type ICourse } from '@/models/academics/Course';
import ClassSlot from '@/models/academics/ClassSlot';
import AttendanceMark from '@/models/academics/AttendanceMark';

/** YYYY-MM-DD for `date` in `timeZone`. */
import { dayKeyIn } from '@/lib/time';

export { dayKeyIn };

export function gradePoints(grade: string, scale: GradeScaleKey): number | null {
  if (!grade) return null;
  const table = GRADE_SCALES[scale].grades as Record<string, number>;
  return grade in table ? table[grade] : null;
}

/**
 * Every active course with its attendance outlook and grade picture, plus the
 * term GPA. One aggregate for attendance, so the page is one round trip.
 */
export async function courseOverview(userId: string, scale: GradeScaleKey, term?: string) {
  const filter: Record<string, unknown> = { user: userId, archived: false };
  if (term) filter.term = term;
  const courses = await Course.find(filter).sort({ code: 1, name: 1 }).lean();
  const tallies = await AttendanceMark.aggregate<{ _id: Types.ObjectId; present: number; absent: number; cancelled: number }>([
    { $match: { user: new Types.ObjectId(userId), course: { $in: courses.map((c) => c._id) } } },
    {
      $group: {
        _id: '$course',
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
      },
    },
  ]);
  const tallyOf = new Map(tallies.map((t) => [String(t._id), t]));

  const rows = courses.map((c) => {
    const t = tallyOf.get(String(c._id)) ?? { present: 0, absent: 0, cancelled: 0 };
    const held = t.present + t.absent;
    const remaining = c.plannedSessions ? Math.max(0, c.plannedSessions - held - t.cancelled) : undefined;
    return {
      ...serialiseCourse(c),
      attendance: { present: t.present, absent: t.absent, cancelled: t.cancelled, ...attendanceOutlook({ attended: t.present, missed: t.absent, remaining }, c.requiredAttendance) },
      grades: {
        ...summariseComponents(c.components),
        points: gradePoints(c.grade, scale),
        neededFor: Object.fromEntries([60, 70, 80, 90].map((target) => [target, neededOnRemaining(c.components, target)])),
      },
    };
  });

  const terms = await Course.distinct('term', { user: userId, archived: false });
  const allGraded = await Course.find({ user: userId, grade: { $ne: '' } }).select('credits grade term').lean();
  return {
    courses: rows,
    termGpa: gpa(rows.map((r) => ({ credits: r.credits, points: r.grades.points }))),
    cgpa: gpa(allGraded.map((c) => ({ credits: c.credits, points: gradePoints(c.grade, scale) }))),
    scale,
    terms: terms.filter(Boolean).sort(),
  };
}

export function serialiseCourse(c: ICourse) {
  return {
    _id: String(c._id),
    term: c.term,
    code: c.code,
    name: c.name,
    professor: c.professor,
    credits: c.credits,
    color: c.color,
    requiredAttendance: c.requiredAttendance,
    plannedSessions: c.plannedSessions ?? null,
    components: c.components,
    grade: c.grade,
  };
}

/** Today's classes in the user's zone, each with whatever mark exists. */
export async function todaysClasses(userId: string, timeZone: string, now = new Date()) {
  const day = weekdayIndex(now, timeZone);
  const key = dayKeyIn(now, timeZone);
  const [slots, marks] = await Promise.all([
    ClassSlot.find({ user: userId, day }).sort({ start: 1 }).populate<{ course: ICourse }>('course').lean(),
    AttendanceMark.find({ user: userId, day: key }).lean(),
  ]);
  return slots
    .filter((s) => s.course && !s.course.archived)
    .map((s) => {
      const mark = marks.find((m) => String(m.course) === String(s.course._id) && (!m.slot || String(m.slot) === String(s._id)));
      return {
        slotId: String(s._id),
        courseId: String(s.course._id),
        name: s.course.name,
        code: s.course.code,
        color: s.course.color,
        start: s.start,
        end: s.end,
        room: s.room,
        kind: s.kind,
        status: mark?.status ?? null,
        day: key,
      };
    });
}

export function validateWeights(components: Array<{ weight: number }> | undefined) {
  if (!components) return;
  const total = components.reduce((n, c) => n + c.weight, 0);
  if (total > 100.0001) throw ApiError.unprocessable(`Component weights add up to ${total}% — they should total 100% or less.`);
}
