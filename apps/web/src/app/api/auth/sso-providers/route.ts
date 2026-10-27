import { NextResponse } from 'next/server';
import { ssoProviders } from '@/lib/auth';

/** SSO buttons to render on the web and in the native app. */
export function GET() {
  return NextResponse.json({ providers: ssoProviders });
}
