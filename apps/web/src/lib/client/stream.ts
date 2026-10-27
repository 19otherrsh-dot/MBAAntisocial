'use client';

import { ApiClientError } from './api';

/**
 * POSTs JSON and streams the plain-text response, calling `onText` with the
 * accumulated text as it arrives. Error responses keep the API's JSON envelope
 * and surface as an `ApiClientError` with the server's message.
 */
export async function streamText(
  url: string,
  body: unknown,
  onText: (full: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    let code = 'unknown';
    try {
      const payload = (await response.json()) as { error?: { message?: string; code?: string } };
      message = payload.error?.message ?? message;
      code = payload.error?.code ?? code;
    } catch {
      /* non-JSON error page */
    }
    throw new ApiClientError(response.status, code, message);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onText(full);
  }
  full += decoder.decode();
  onText(full);
  return full;
}
