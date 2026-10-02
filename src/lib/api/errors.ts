import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { env } from '@/lib/env';

/**
 * Every failure the API returns deliberately, as opposed to a crash. Carrying a
 * status on the error lets route handlers `throw` and let one wrapper decide
 * the shape of the response.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message = 'That request was malformed.', details?: unknown) {
    return new ApiError(400, 'bad_request', message, details);
  }

  static unauthorized(message = 'Sign in to continue.') {
    return new ApiError(401, 'unauthorized', message);
  }

  static forbidden(message = 'You do not have access to this.') {
    return new ApiError(403, 'forbidden', message);
  }

  static notFound(message = 'Not found.') {
    return new ApiError(404, 'not_found', message);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, 'conflict', message, details);
  }

  static unprocessable(message: string, details?: unknown) {
    return new ApiError(422, 'unprocessable', message, details);
  }

  static tooManyRequests(message = 'Slow down a moment, then try again.', retryAfterSeconds?: number) {
    return new ApiError(429, 'rate_limited', message, { retryAfterSeconds });
  }

  static internal(message = 'Something broke on our side.') {
    return new ApiError(500, 'internal_error', message);
  }
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Flattens a ZodError into `{ "field.path": "message" }` for form display. */
export function formatZodIssues(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    // Keep the first message per field — forms show one line at a time.
    if (!(path in fieldErrors)) fieldErrors[path] = issue.message;
  }
  return fieldErrors;
}

/**
 * Normalises anything thrown inside a route into a JSON response. Unexpected
 * errors are logged in full but reported generically, so internal details and
 * stack traces never reach a client.
 */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    const headers = new Headers();
    const retryAfter = (error.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    if (error.status === 429 && retryAfter) headers.set('Retry-After', String(retryAfter));

    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status, headers }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'Some fields need fixing.',
          details: formatZodIssues(error),
        },
      },
      { status: 422 }
    );
  }

  // Mongoose duplicate-key violations map cleanly onto 409.
  if (isDuplicateKeyError(error)) {
    return NextResponse.json(
      { error: { code: 'conflict', message: 'That already exists.' } },
      { status: 409 }
    );
  }

  console.error('[api] unhandled error:', error);

  return NextResponse.json(
    {
      error: {
        code: 'internal_error',
        message: 'Something broke on our side. Try again in a moment.',
        ...(env.isProduction ? {} : { details: error instanceof Error ? error.message : String(error) }),
      },
    },
    { status: 500 }
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  );
}
