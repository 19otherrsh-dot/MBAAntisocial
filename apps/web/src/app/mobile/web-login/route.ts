import { NextResponse, type NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import connectDB from '@/lib/mongodb';
import { env } from '@/lib/env';
import { loadSessionUser, redeemHandoffCode } from '@/server/modules/auth/service';

const MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Turns a one-time code minted for the native app into a normal web session,
 * so a WebView can open web-only screens already signed in. The code is single
 * use and lives sixty seconds; `next` must be a same-origin path.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const next = url.searchParams.get('next') ?? '/home';
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/home';

  await connectDB();
  const userId = code ? await redeemHandoffCode(code, 'to_web') : null;
  const user = userId ? await loadSessionUser(userId) : null;
  if (!user) return NextResponse.redirect(new URL('/login?error=handoff', env.APP_URL));

  const secure = env.APP_URL.startsWith('https://');
  const cookieName = secure ? '__Secure-authjs.session-token' : 'authjs.session-token';
  const token = await encode({
    salt: cookieName,
    secret: env.AUTH_SECRET,
    maxAge: MAX_AGE,
    token: { ...user, sub: user.id, picture: user.image },
  });

  const response = NextResponse.redirect(new URL(safeNext, env.APP_URL));
  response.cookies.set(cookieName, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: MAX_AGE });
  // Opened inside the native app: render pages without the web's own navigation.
  if (url.searchParams.get('embed') === '1') response.cookies.set('mba-embed', '1', { httpOnly: true, sameSite: 'lax', secure, path: '/' });
  return response;
}
