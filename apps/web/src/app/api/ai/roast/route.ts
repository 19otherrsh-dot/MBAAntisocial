import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';
import { container } from '@/server/container';
import { textStreamResponse } from '@/server/modules/ai/chat-input';
import { roastSystem } from '@/server/modules/ai/prompts';

const schema = z.object({
  pdfUrl: z.string().url(),
  target: z.string().trim().max(80).optional(),
});

/** A PDF resume is about two pages; anything near this is not a resume. */
const MAX_RESUME_BYTES = Math.min(MAX_FILE_SIZE_BYTES, 8 * 1024 * 1024);

/**
 * Resume teardown. The PDF goes to Claude as a document, so layout and
 * formatting are reviewed too — not just extracted text.
 */
export const POST = route({ body: schema, rateLimit: 'ai', feature: 'resume' }, async ({ actor, body }) => {
  const { storage, ai } = container();

  // The server fetches this URL, so it must be one our storage produced —
  // otherwise it is a request-forgery vector into the internal network.
  if (!storage.isOwnUrl(body.pdfUrl)) {
    throw ApiError.badRequest('Upload the file through the app rather than linking to it.');
  }

  let pdf: Buffer;
  try {
    pdf = await storage.read(body.pdfUrl, MAX_RESUME_BYTES);
  } catch {
    throw ApiError.badRequest('Could not read that file. Upload it again as a PDF under 8 MB.');
  }
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw ApiError.unprocessable('That file is not a PDF.');

  const stream = await ai.streamChat({
    system: roastSystem({ name: actor.name, year: actor.year, campus: actor.campus, target: body.target }),
    messages: [{ role: 'user', content: 'Here is my resume. Tear it apart, then help me fix it.' }],
    pdfBase64: pdf.toString('base64'),
    effort: 'medium',
    maxTokens: 6000,
    userId: actor.id,
    feature: 'resume_roast',
  });
  return textStreamResponse(stream);
});
