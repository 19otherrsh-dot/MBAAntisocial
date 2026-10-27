import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import Course from '@/models/academics/Course';
import ClassSlot from '@/models/academics/ClassSlot';

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const PALETTE = ['#5b4bdb', '#0c8599', '#d9480f', '#2b8a3e', '#c2255c', '#e67700', '#1971c2', '#6741d9', '#087f5b', '#a61e4d'];

const schema = z.object({
  term: z.string().trim().max(40).default(''),
  courses: z
    .array(
      z.object({
        code: z.string().trim().max(20).default(''),
        name: z.string().trim().min(1).max(100),
        professor: z.string().trim().max(80).default(''),
        slots: z.array(z.object({ day: z.number().int().min(0).max(6), start: clock, end: clock, room: z.string().trim().max(40).default('') })).max(14),
      })
    )
    .min(1)
    .max(25),
});

/** Saves a confirmed import: one course per entry, with its weekly slots. */
export const POST = route({ body: schema, rateLimit: 'write', feature: 'timetable' }, async ({ actor, body }) => {
  let slots = 0;
  for (const [i, c] of body.courses.entries()) {
    const course = await Course.create({ user: actor.id, term: body.term, code: c.code, name: c.name, professor: c.professor, color: PALETTE[i % PALETTE.length] });
    const rows = c.slots.filter((s) => s.start < s.end).map((s) => ({ ...s, user: actor.id, course: course._id }));
    if (rows.length) await ClassSlot.insertMany(rows);
    slots += rows.length;
  }
  return ok({ courses: body.courses.length, slots });
});
