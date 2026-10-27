import { NextResponse, type NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { verifyState } from '@/server/crypto';
import { connectorFor } from '@/server/modules/integrations/registry';

/**
 * OAuth return leg. The signed state must name the signed-in user, so a
 * callback URL replayed into someone else's browser connects nothing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const state = verifyState<{ uid: string; p: string; r: string }>(url.searchParams.get('state') ?? '');
  const session = await auth();
  const back = (status: string, returnTo = '/settings') =>
    NextResponse.redirect(new URL(`${returnTo}?integration=${provider}&status=${status}`, env.APP_URL));

  if (!state || state.p !== provider || !session?.user?.id || session.user.id !== state.uid) return back('invalid');
  if (url.searchParams.get('error')) return back('cancelled', state.r);

  const code = url.searchParams.get('code');
  const connector = await connectorFor(provider);
  if (!code || !connector) return back('invalid', state.r);

  try {
    await connectDB();
    await connector.complete(state.uid, code, `${env.APP_URL}/api/integrations/${provider}/callback`);
    return back('connected', state.r);
  } catch (error) {
    console.error(`[integrations] ${provider} connect failed:`, error);
    return back('failed', state.r);
  }
}
