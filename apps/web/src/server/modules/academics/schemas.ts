import { z } from 'zod';
import { objectId } from '@/lib/validation';

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour time like 09:30.');

export const componentSchema = z.object({
  name: z.string().trim().min(1).max(60),
  weight: z.number().min(0).max(100),
  score: z.number().min(0).optional(),
  max: z.number().positive().max(1000).default(100),
});

export const courseSchema = z.object({
  term: z.string().trim().max(40).default(''),
  code: z.string().trim().max(20).default(''),
  name: z.string().trim().min(1).max(100),
  professor: z.string().trim().max(80).default(''),
  credits: z.number().min(0).max(20).default(3),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5b4bdb'),
  requiredAttendance: z.number().min(0).max(100).default(75),
  plannedSessions: z.number().int().min(0).max(400).optional(),
  components: z.array(componentSchema).max(12).default([]),
  grade: z.string().max(4).default(''),
});

export const courseUpdateSchema = courseSchema.partial().extend({ archived: z.boolean().optional() });

export const slotSchema = z
  .object({
    course: objectId,
    day: z.number().int().min(0).max(6),
    start: clock,
    end: clock,
    room: z.string().trim().max(40).default(''),
    kind: z.enum(['lecture', 'tutorial', 'lab', 'other']).default('lecture'),
  })
  .refine((s) => s.start < s.end, { message: 'A class has to end after it starts.', path: ['end'] });

export const markSchema = z.object({
  course: objectId,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: objectId.optional(),
  status: z.enum(['present', 'absent', 'cancelled']).nullable(),
});

export const settingsSchema = z.object({
  gradeScale: z.enum(['4.33', '4', '10']).optional(),
  currentTerm: z.string().trim().max(40).optional(),
});

/** What the AI pulls out of a timetable screenshot or PDF. */
export const extractedTimetableSchema = z.object({
  courses: z.array(
    z.object({
      code: z.string().describe('Course code if shown, else empty'),
      name: z.string().describe('Course name as written'),
      professor: z.string().describe('Instructor if shown, else empty'),
      slots: z.array(
        z.object({
          day: z.number().int().min(0).max(6).describe('Monday=0 … Sunday=6'),
          start: z.string().describe('24h HH:MM'),
          end: z.string().describe('24h HH:MM'),
          room: z.string().describe('Room or venue if shown, else empty'),
        })
      ),
    })
  ),
  notes: z.string().describe('Anything ambiguous the student should double-check, in one or two sentences; empty if none'),
});
