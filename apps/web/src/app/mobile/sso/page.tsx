'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

/**
 * Entry point the native app opens in an auth session browser. It starts the
 * chosen SSO flow and lands on `/mobile/sso/complete`, which deep-links back.
 */
export default function MobileSsoPage() {
  return (
    <Suspense fallback={null}>
      <Start />
    </Suspense>
  );
}

function Start() {
  const params = useSearchParams();
  useEffect(() => {
    const provider = params.get('provider');
    if (provider) void signIn(provider, { callbackUrl: '/mobile/sso/complete' });
  }, [params]);
  return <p style={{ padding: 24, fontFamily: 'system-ui' }}>Opening sign-in…</p>;
}
