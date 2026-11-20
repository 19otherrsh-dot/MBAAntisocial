import { NextResponse } from 'next/server';
import { enabledSsoProviders } from '@/lib/sso';

/** Which sign-in buttons to show. Public; lists names only, never secrets. */
export function GET() {
  return NextResponse.json({ providers: enabledSsoProviders() }, { headers: { 'Cache-Control': 'no-store' } });
}
