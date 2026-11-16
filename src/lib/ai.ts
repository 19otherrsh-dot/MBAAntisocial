import { google } from '@ai-sdk/google';
import { ApiError } from './api/errors';
import { env } from './env';

/**
 * Shared plumbing for the AI routes.
 *
 * The model id comes from `GEMINI_MODEL` rather than being written into each
 * route. It previously named a specific version in two places; when the
 * provider retired that version, both features failed at once with nothing to
 * change short of a deploy.
 */
export function requireModel() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new ApiError(
      503,
      'ai_unavailable',
      'The AI features are not switched on for this campus yet.'
    );
  }
  return google(env.GEMINI_MODEL);
}

/** The subset of a `streamText` result this module reads. */
interface TextStreamSource {
  fullStream: AsyncIterable<{ type: string; text?: string; error?: unknown }>;
}

function upstreamFailure(error: unknown): ApiError {
  console.error('[ai] model call failed:', error);
  return new ApiError(
    502,
    'ai_unavailable',
    'The AI did not answer. Give it a moment and try again.'
  );
}

/**
 * Turns a model stream into a plain-text HTTP response.
 *
 * A model call fails *after* the handler has returned — quota, a bad key, a
 * retired model id all surface as an error part inside the stream. By then a
 * 200 has already been sent, so the page would show an empty reply with no
 * explanation. This waits for the first piece of text before committing to a
 * response: a failure up to that point becomes a real error status the client
 * can report, and only then does streaming begin.
 */
export async function streamAsText(
  source: TextStreamSource,
  headers: Record<string, string> = {}
): Promise<Response> {
  const iterator = source.fullStream[Symbol.asyncIterator]();
  const encoder = new TextEncoder();

  let first: string | null = null;
  for (;;) {
    const { done, value } = await iterator.next();
    if (done) break;
    if (value.type === 'error') throw upstreamFailure(value.error);
    if (value.type === 'text-delta' && value.text) {
      first = value.text;
      break;
    }
  }
  if (first === null) throw upstreamFailure(new Error('empty completion'));

  const opening = first;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(opening));
      try {
        for (;;) {
          const { done, value } = await iterator.next();
          if (done) break;
          if (value.type === 'error') {
            console.error('[ai] stream interrupted:', value.error);
            break;
          }
          if (value.type === 'text-delta' && value.text) {
            controller.enqueue(encoder.encode(value.text));
          }
        }
      } catch (error) {
        console.error('[ai] stream interrupted:', error);
      } finally {
        controller.close();
      }
    },
    async cancel() {
      // The reader went away (the user hit stop); stop pulling from the model.
      await iterator.return?.();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      ...headers,
    },
  });
}
