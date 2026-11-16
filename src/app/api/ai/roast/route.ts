import { streamText } from 'ai';
import { PDFParse } from 'pdf-parse';
import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { requireModel, streamAsText } from '@/lib/ai';
import { MAX_DIRECT_UPLOAD_BYTES } from '@/lib/constants';

/** Upper bound on the text handed to the model, so one CV cannot cost a fortune. */
const MAX_RESUME_CHARS = 20_000;

const INTENSITY = {
  gentle: 'Be direct but kind. Lead with what works, then the two or three fixes that matter most.',
  honest: 'Be blunt and dry. No padding, no flattery — say what a tired recruiter would think.',
  savage: 'Be merciless and funny about the writing. Roast the bullets hard — but only the bullets.',
} as const;

type Intensity = keyof typeof INTENSITY;

/**
 * Reads a resume and critiques it.
 *
 * The PDF is posted straight to this route, parsed in memory, and discarded.
 * It used to be uploaded to a public media host first and then fetched back by
 * URL, which left every roasted resume — a document full of personal details —
 * sitting on a CDN indefinitely, and needed an SSRF guard on the fetch. Nothing
 * is stored now, so there is nothing to leak and no URL to validate.
 */
export const POST = route({ rateLimit: 'ai' }, async ({ request, actor }) => {
  const model = requireModel();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw ApiError.badRequest('Could not read that upload.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) throw ApiError.badRequest('Attach your resume as a PDF.');
  if (file.size === 0) throw ApiError.badRequest('That file is empty.');
  if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
    throw ApiError.unprocessable(
      `Keep the PDF under ${Math.round(MAX_DIRECT_UPLOAD_BYTES / 1_048_576)} MB. A resume is two pages — export it without embedded images.`
    );
  }

  const requested = String(form.get('intensity') ?? 'honest');
  const intensity: Intensity = requested in INTENSITY ? (requested as Intensity) : 'honest';

  const buffer = Buffer.from(await file.arrayBuffer());
  // Checked on the bytes, not the client-declared type: every PDF starts "%PDF-".
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw ApiError.unprocessable('That is not a PDF. Export your resume as a PDF and try again.');
  }

  // pdf-parse v2 is a class with an explicit lifecycle; `destroy()` releases
  // the worker, and skipping it leaks one per request.
  let extractedText = '';
  try {
    const parser = new PDFParse({ data: buffer });
    try {
      extractedText = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    console.error('[roast] PDF parse error:', error);
    throw ApiError.unprocessable(
      'Could not read text from that PDF. Make sure it is exported from a document, not a scan.'
    );
  }

  if (!extractedText.trim()) {
    throw ApiError.unprocessable('No readable text in that PDF — it looks like a scanned image.');
  }

  // A resume is two pages. Anything longer is either not a resume or an attempt
  // to run up the bill, and truncating costs the user nothing real.
  extractedText = extractedText.slice(0, MAX_RESUME_CHARS);

  const system = `You are the "Antisocial Resume Roaster", a recruiter who has screened ten thousand MBA resumes for consulting, finance, and product roles in India.
Read the candidate's resume text and critique it line by line.

Tone: ${INTENSITY[intensity]}

Rules:
1. Call out fluff, empty buzzwords ("synergised", "leveraged"), and weak verbs.
2. Demand impact. A bullet with no number (₹2 Cr revenue, 20% cost reduction, a team of 8) has not earned its line.
3. Roast the writing, never the person, their background, their college, or anything they cannot change.
4. For the weakest bullets, show a rewritten version next to the original.
5. Use markdown: short headings, bullet lists, and **bold** for the phrases you are quoting.
6. End with a section titled "Fix these first" — the three changes that would help most, in order.

The candidate is ${actor.name}, a ${actor.year === 2 ? 'second' : 'first'}-year MBA at ${actor.campus}. Start straight in with the critique.`;

  const result = streamText({
    model,
    system,
    messages: [
      { role: 'user', content: `Here is the text extracted from my resume:\n\n${extractedText}` },
    ],
    onError: () => {},
  });

  return streamAsText(result);
});
