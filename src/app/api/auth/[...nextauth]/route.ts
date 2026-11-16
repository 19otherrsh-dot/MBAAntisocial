import type { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { ApiError } from '@/lib/api/errors';
import { consume, clientIdentifier } from '@/lib/api/rate-limit';

export const { GET } = handlers;

/**
 * Throttles password attempts before they reach the provider.
 *
 * The `login` bucket was defined but never applied, so the sign-in endpoint
 * accepted unlimited guesses. A refusal is returned in the shape the Auth.js
 * client expects from a failed credentials sign-in — a `url` carrying the error
 * — so the form shows a message instead of throwing on an unexpected body.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (request.nextUrl.pathname.endsWith('/callback/credentials')) {
    try {
      consume('login', clientIdentifier(request));
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        const url = new URL('/login', request.nextUrl.origin);
        url.searchParams.set('error', 'CredentialsSignin');
        url.searchParams.set('code', 'rate_limited');
        return Response.json({ url: url.toString() }, { status: 429 });
      }
      throw error;
    }
  }
  return handlers.POST(request);
}
