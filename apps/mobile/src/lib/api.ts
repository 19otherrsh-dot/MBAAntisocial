import { API_URL } from './config';

/** The API's error envelope, `{ error: { code, message } }`, as a thrown error. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Wired by the auth provider: the bearer for every call, and what to do when it stops working. */
export function configureApi(next: { token: string | null; onUnauthorized: () => void }) {
  token = next.token;
  onUnauthorized = next.onUnauthorized;
}

export async function request<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token && init.auth !== false) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'offline', 'Can’t reach MBAAntisocial. Check your connection.');
  }

  const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    // A revoked or expired session: sign out rather than failing every screen.
    if (response.status === 401 && token && init.auth !== false) onUnauthorized?.();
    throw new ApiError(response.status, payload?.error?.code ?? 'unknown', payload?.error?.message ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
};

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
