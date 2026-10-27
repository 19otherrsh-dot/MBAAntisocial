import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import { env } from '@/lib/env';
import { issueHandoffCode } from '@/server/modules/auth/service';

/** The app's URL scheme (app.json `scheme`). Only this target is ever redirected to. */
const APP_SCHEME = process.env.MOBILE_APP_SCHEME || 'mbaantisocial';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL('/login?error=sso_cancelled', env.APP_URL));
  await connectDB();
  const code = await issueHandoffCode(session.user.id, 'to_app');
  return NextResponse.redirect(`${APP_SCHEME}://auth?code=${encodeURIComponent(code)}`);
}
