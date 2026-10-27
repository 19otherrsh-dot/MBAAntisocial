import { NextResponse } from 'next/server';
import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { env } from '@/lib/env';
import { signState } from '@/server/crypto';
import { connectorFor } from '@/server/modules/integrations/registry';

/** Starts an integration OAuth flow. State is signed and bound to the caller. */
export const GET = route({}, async ({ actor, params, request }) => {
  const connector = await connectorFor(params.provider);
  if (!connector) throw ApiError.notFound('That integration is not enabled here.');
  const returnTo = new URL(request.url).searchParams.get('returnTo') ?? '/settings';
  const state = signState({ uid: actor.id, p: connector.provider, r: returnTo.startsWith('/') ? returnTo : '/settings' });
  const redirectUri = `${env.APP_URL}/api/integrations/${connector.provider}/callback`;
  return NextResponse.redirect(connector.authorizeUrl(state, redirectUri));
});
