import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { container } from '@/server/container';
import { extractedTimetableSchema } from '@/server/modules/academics/schemas';

const MAX_BYTES = 6 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

const SYSTEM = `You read university timetables (screenshots, photos, or PDFs) for Indian MBA students and return every recurring weekly class.
Rules: Monday is day 0. Use 24-hour HH:MM. One course appears once with all of its weekly slots. Skip breaks, lunch, and one-off events.
If a cell is unreadable, leave it out and mention it in notes. Never invent courses or times that are not visible.`;

/**
 * Reads a timetable from a screenshot or PDF and returns a preview. Nothing is
 * saved until the student confirms it through /import/apply.
 */
export const POST = route({ rateLimit: 'ai', feature: 'timetable' }, async ({ actor, request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw ApiError.badRequest('Attach a screenshot or PDF of your timetable.');
  if (file.size > MAX_BYTES) throw ApiError.unprocessable('Keep the file under 6 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf = bytes.subarray(0, 4).toString() === '%PDF';
  const imageType = IMAGE_TYPES.find((t) => t === file.type);
  if (!isPdf && !imageType) throw ApiError.unprocessable('Use a PNG, JPEG, WebP, or PDF.');

  const extracted = await container().ai.structured({
    system: SYSTEM,
    prompt: 'Extract the weekly timetable.',
    schema: extractedTimetableSchema,
    effort: 'medium',
    maxTokens: 8000,
    userId: actor.id,
    feature: 'timetable_import',
    ...(isPdf ? { pdfBase64: bytes.toString('base64') } : { image: { base64: bytes.toString('base64'), mediaType: imageType! } }),
  });
  // Drop slots the model could not express as valid clock times.
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  return ok({
    courses: extracted.courses
      .map((c) => ({ ...c, slots: c.slots.filter((s) => clock.test(s.start) && clock.test(s.end) && s.start < s.end) }))
      .filter((c) => c.name.trim() && c.slots.length > 0),
    notes: extracted.notes,
  });
});
