'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, errorMessage } from '@/lib/client/api';
import styles from '../auth.module.css';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className={styles.formBody}><div className="skeleton" style={{ height: 160 }} /></div>}>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .post('/api/auth/verify', { token })
      .then(() => {
        if (!cancelled) router.replace('/login?verified=1');
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(errorMessage(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  const failure = !token ? 'That link is incomplete. Open it from the email again.' : error;

  if (failure) {
    return (
      <div className={styles.formBody}>
        <h1 className={styles.title}>We could not confirm that</h1>
        <p className={styles.subtitle}>{failure}</p>
        <p className={styles.footerNote}>
          <Link href="/login">Sign in</Link> and we will offer to send a fresh link.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.formBody}>
      <h1 className={styles.title}>Confirming your email…</h1>
      <p className={styles.subtitle}>One moment.</p>
    </div>
  );
}
