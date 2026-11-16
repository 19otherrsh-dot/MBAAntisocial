'use client';

import { ApiClientError } from './api';

/**
 * Reads a plain-text streaming response, calling `onText` with the text so far
 * each time more arrives.
 *
 * The AI routes answer with raw UTF-8 text. The pages used to look for lines
 * beginning `0:` — a different wire format the server never sent — so every
 * chunk was discarded and the reply stayed blank. There is no framing to parse
 * here: whatever arrives is the reply. `stream: true` on the decoder matters,
 * because a multi-byte character (₹, an em dash) can be split across chunks.
 */
export async function readTextStream(
  response: Response,
  onText: (textSoFar: string) => void
): Promise<string> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    throw new ApiClientError(
      response.status,
      payload?.error?.code ?? 'unknown',
      payload?.error?.message ?? `Request failed (${response.status}).`,
      payload?.error?.details
    );
  }
  if (!response.body) throw new Error('The server sent an empty response.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  text += decoder.decode();
  onText(text);
  return text;
}
