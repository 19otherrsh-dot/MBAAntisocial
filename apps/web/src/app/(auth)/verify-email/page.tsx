'use client';

import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { MailCheck, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Banner } from '@/components/ui/Display';
import { api, errorMessage } from '@/lib/client/api';
import styles from '../auth.module.css';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <Verify />
    </Suspense>
  );
}

function Verify() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, update, status } = useSession();
  const token = params.get('token');
  const email = params.get('email');

  const [state, setState] = useState<'idle' | 'verifying' | 'verified' | 'failed'>(token && email ? 'verifying' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Development-mode link stashed by the register form; read without an effect.
  const storedLink = useSyncExternalStore(
    () => () => undefined,
    () => sessionStorage.getItem('dev-verify-link'),
    () => null
  );
  const [freshLink, setDevLink] = useState<string | null>(null);
  const devLink = freshLink ?? storedLink;
  const [resending, setResending] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!token || !email || started.current) return;
    started.current = true;
    api
      .post('/api/auth/verify-email', { email, token })
      .then(async () => {
        sessionStorage.removeItem('dev-verify-link');
        setState('verified');
        // Refresh the session token so the app stops routing here.
        if (session?.user) await update({ verified: true });
      })
      .catch((caught) => {
        setState('failed');
        setError(errorMessage(caught));
      });
  }, [token, email, session?.user, update]);

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const result = await api.post<{ sent: boolean; devLink?: string }>('/api/auth/verify-email/resend');
      setNotice(result.sent ? 'Sent. Give it a minute, and check spam if it’s shy.' : 'Already verified — carry on.');
      if (result.devLink) setDevLink(result.devLink);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setResending(false);
    }
  };

  if (state === 'verifying') {
    return (
      <div className={styles.formBody}>
        <div className="skeleton" style={{ height: 120 }} />
        <p className={styles.subtitle}>Confirming your email…</p>
      </div>
    );
  }

  if (state === 'verified') {
    return (
      <div className={styles.formBody}>
        <div className={styles.statusArt}><CheckCircle2 size={26} /></div>
        <h1 className={styles.title}>You’re verified</h1>
        <p className={styles.subtitle}>Welcome to your campus. Let’s finish setting you up.</p>
        <Button size="lg" fullWidth className="mt-4" onClick={() => { router.refresh(); router.push(session?.user ? '/onboarding' : '/login'); }}>
          {session?.user ? 'Continue' : 'Sign in'}
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.formBody}>
      <div className={styles.statusArt}><MailCheck size={26} /></div>
      <h1 className={styles.title}>{state === 'failed' ? 'That link didn’t work' : 'Check your institute inbox'}</h1>
      <p className={styles.subtitle}>
        {state === 'failed'
          ? 'It may have expired or already been used. Send yourself a fresh one.'
          : <>We sent a confirmation link to <strong>{session?.user?.email ?? 'your institute email'}</strong>. Click it and you’re in.</>}
      </p>

      <div className={styles.form}>
        {error && <Banner variant="danger" icon={<AlertCircle size={16} />}>{error}</Banner>}
        {notice && <Banner variant="success" icon={<CheckCircle2 size={16} />}>{notice}</Banner>}
        {devLink && (
          <Banner variant="info" icon={<Info size={16} />}>
            Development mode — no mail provider configured. <a href={devLink}>Open the confirmation link</a>.
          </Banner>
        )}
        {status === 'authenticated' ? (
          <>
            <Button size="lg" fullWidth loading={resending} onClick={resend}>Resend the link</Button>
            <Button variant="ghost" fullWidth onClick={() => signOut({ callbackUrl: '/login' })}>Use a different account</Button>
          </>
        ) : (
          <Link href="/login"><Button size="lg" fullWidth>Sign in to resend</Button></Link>
        )}
      </div>
    </div>
  );
}
