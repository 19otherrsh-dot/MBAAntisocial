'use client';

/**
 * Browser-side API client.
 *
 * Every call funnels through here so the structured error body the routes
 * return (`{ error: { code, message, details } }`) becomes a real thrown error
 * with a usable message, instead of each page reimplementing `res.ok` checks
 * and falling back to a generic "something went wrong".
 */

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  /** Field-level messages from a validation failure, keyed by field path. */
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.fieldErrors =
      details && typeof details === 'object' && !Array.isArray(details)
        ? (details as Record<string, string>)
        : {};
  }

  get isValidation(): boolean {
    return this.status === 422 || this.code === 'validation_failed';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, query } = options;

  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method,
    signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON body means something upstream failed — a proxy error page, a
    // redirect to the login screen — so report the status rather than crashing.
    if (!response.ok) {
      throw new ApiClientError(response.status, 'network', `Request failed (${response.status}).`);
    }
    return undefined as T;
  }

  if (!response.ok) {
    const envelope = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      .error;
    throw new ApiClientError(
      response.status,
      envelope?.code ?? 'unknown',
      envelope?.message ?? 'Something went wrong.',
      envelope?.details
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'DELETE', query }),
};

/** Human-readable message for anything thrown by a request. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') return '';
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
