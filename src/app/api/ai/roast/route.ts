import { streamText, type ModelMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { PDFParse } from 'pdf-parse';
import { isOwnCloudinaryUrl } from '@/lib/cloudinary';
import { MAX_FILE_SIZE_BYTES } from '@/lib/constants';

/** Upper bound on the text handed to the model, so one CV cannot cost a fortune. */
const MAX_RESUME_CHARS = 20_000;

export const POST = route({ rateLimit: 'ai' }, async ({ request, actor }) => {
  let body: { pdfUrl: string };
  try {
    body = await request.json();
  } catch {
    throw ApiError.badRequest('Invalid JSON body');
  }

  const { pdfUrl } = body;

  if (!pdfUrl) {
    throw ApiError.badRequest('pdfUrl is required');
  }

  /*
   * The URL is supplied by the caller and fetched by the server, which without
   * this check is a server-side request forgery vector — point it at a cloud
   * metadata endpoint or an internal address and the server becomes a proxy
   * into a network the caller cannot otherwise reach. Only assets this app
   * uploaded are fetchable.
   */
  if (!isOwnCloudinaryUrl(pdfUrl)) {
    throw ApiError.badRequest('Upload the file through the app rather than linking to it.');
  }

  // 1. Fetch the PDF from Cloudinary
  let pdfBuffer: Buffer;
  try {
    const res = await fetch(pdfUrl, { redirect: 'error' });
    if (!res.ok) throw new Error('Failed to fetch PDF');

    // Trust the header when present, and verify against the body regardless —
    // a lying Content-Length must not turn into an unbounded read.
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > MAX_FILE_SIZE_BYTES) throw new Error('PDF too large');

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_FILE_SIZE_BYTES) throw new Error('PDF too large');

    pdfBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('PDF fetch error:', err);
    throw ApiError.badRequest('Could not download that file.');
  }

  // 2. Parse the text.
  //    pdf-parse v2 is a class with an explicit lifecycle rather than v1's
  //    single default function; `destroy()` releases the worker, and skipping
  //    it leaks one per request.
  let extractedText = '';
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    try {
      const result = await parser.getText();
      extractedText = result.text;
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    console.error('PDF parse error:', err);
    throw ApiError.badRequest('Could not parse text from this PDF. Make sure it is text-based and not scanned images.');
  }

  if (!extractedText.trim()) {
    throw ApiError.badRequest('No readable text found in the PDF.');
  }

  // A resume is two pages. Anything longer is either not a resume or an attempt
  // to run up the bill, and truncating costs the user nothing real.
  extractedText = extractedText.slice(0, MAX_RESUME_CHARS);

  // 3. Roast it
  const systemPrompt = `
You are the "Antisocial Resume Roaster", an elite, unforgiving, and cynical MBA recruiter for top-tier consulting and finance firms.
Your job is to read the candidate's resume text and tear it apart line by line.

Rules of engagement:
1. Be brutally honest. Point out fluff, meaningless buzzwords ("synergized", "leveraged"), and weak action verbs.
2. Demand impact. If a bullet doesn't have a quantified metric (e.g. "$5M revenue increase", "20% cost reduction"), call it out.
3. Fix bad formatting. If the text looks unorganized or uses poor structure, make fun of it (professionally but firmly).
4. Do not hold back. Your persona is a high-performing professional who has read 10,000 resumes and has zero patience for mediocrity.
5. Provide actionable (but harsh) advice on how to rewrite the worst bullets.
6. Use markdown formatting to highlight specific phrases from the resume.

The candidate's name is ${actor.name} (${actor.year === 2 ? 'second' : 'first'}-year MBA at ${actor.campus}).
Give them a roasting they will never forget. Start immediately with the teardown.
  `;

  try {
    const result = streamText({
      model: google('gemini-1.5-flash'),
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here is the text extracted from my resume:\n\n${extractedText}`,
        },
      ] satisfies ModelMessage[],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('AI Roast Error:', error);
    throw ApiError.internal('The AI roaster encountered an unexpected error.');
  }
});
