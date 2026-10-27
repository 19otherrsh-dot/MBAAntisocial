import { z } from 'zod';

/**
 * Bounds on what reaches the model. The conversation is supplied by the client
 * on every turn, so without caps the prompt — and the cost — is whatever the
 * caller decides to send. Rate limiting alone does not fix that.
 */
export const MAX_TURNS = 60;
export const MAX_CHARS_PER_TURN = 4_000;
export const MAX_TOTAL_CHARS = 40_000;

export const chatTurnsSchema = z
  .array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().max(MAX_CHARS_PER_TURN, 'Keep each answer under a few paragraphs.'),
    })
  )
  .max(MAX_TURNS, 'That session has run long. Start a fresh one to keep it sharp.')
  .refine((turns) => turns.reduce((n, t) => n + t.content.length, 0) <= MAX_TOTAL_CHARS, {
    message: 'That conversation is too long to continue. Start a fresh one.',
  })
  .refine((turns) => turns.length === 0 || turns[turns.length - 1].role === 'user', {
    message: 'The last turn must be yours.',
  });

export function textStreamResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
