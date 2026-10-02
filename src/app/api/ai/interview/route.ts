import { streamText, type ModelMessage } from 'ai';
import { google } from '@ai-sdk/google';
import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';

// Vercel AI SDK requires the route to export POST directly and handle the Request object.
// But we want to use our route wrapper for auth and rate limiting.
// `ai` expects a standard Web Response. `route` returns a Response.

/**
 * Bounds on what reaches the model.
 *
 * The conversation is supplied by the client on every turn, so without a cap
 * the prompt — and the per-call cost — is whatever the caller decides to send.
 * Rate limiting alone does not fix that: forty calls with a megabyte of context
 * each is still a bill nobody authorised.
 */
const MAX_TURNS = 40;
const MAX_CHARS_PER_TURN = 4_000;
const MAX_TOTAL_CHARS = 24_000;

export const POST = route({ rateLimit: 'ai' }, async ({ request, actor }) => {
  // Extract messages and track from the body
  let body: { messages: ModelMessage[]; track?: string };
  try {
    body = await request.json();
  } catch {
    throw ApiError.badRequest('Invalid JSON body');
  }

  const { messages, track = 'General Management' } = body;

  if (!messages || !Array.isArray(messages)) {
    throw ApiError.badRequest('Messages array is required');
  }

  if (messages.length > MAX_TURNS) {
    throw ApiError.unprocessable(
      'That interview has run long. Start a fresh one to keep the questions sharp.'
    );
  }

  const totalChars = messages.reduce(
    (sum, message) => sum + (typeof message.content === 'string' ? message.content.length : 0),
    0
  );

  if (totalChars > MAX_TOTAL_CHARS) {
    throw ApiError.unprocessable('That conversation is too long to continue. Start a fresh one.');
  }

  if (
    messages.some(
      (message) => typeof message.content === 'string' && message.content.length > MAX_CHARS_PER_TURN
    )
  ) {
    throw ApiError.unprocessable('Keep each answer under a few paragraphs.');
  }

  const systemPrompt = `
You are the "Antisocial MBA Bot", an elite, slightly cynical, and brutally honest alumni interviewer.
You are currently conducting a mock interview for a candidate aiming for a ${track} role.
The candidate is ${actor.name}, a ${actor.year === 2 ? 'second' : 'first'}-year MBA at ${actor.campus}.

Rules of engagement:
1. DO NOT spoon-feed answers. If the candidate struggles, push them to think harder.
2. Be critical but constructive. Adopt the persona of a busy, high-performing professional who is giving up their weekend to help out.
3. Stay in character at all times. Use sharp, witty microcopy.
4. Lead the interview. Start by asking a challenging question related to the ${track} track.
5. If the candidate says something smart, give them a begrudging compliment. If they say something dumb, call it out (professionally but firmly).
6. Keep your responses concise (under 150 words). This is a fast-paced chat.
  `;

  try {
    const result = streamText({
      model: google('gemini-1.5-flash'),
      system: systemPrompt,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('AI Interview Error:', error);
    throw ApiError.internal('The AI interviewer disconnected unexpectedly.');
  }
});
