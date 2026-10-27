import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { issueHandoffCode } from '@/server/modules/auth/service';

/**
 * The app asks for a one-time code, then opens `/mobile/web-login?code=…` in a
 * WebView, which turns it into a normal cookie session for web-only screens.
 */
export const POST = route({ allowUnverified: true }, async ({ actor }) => {
  if (actor.via !== 'bearer') throw ApiError.badRequest('Only the native app needs this.');
  return ok({ code: await issueHandoffCode(actor.id, 'to_web') });
});
