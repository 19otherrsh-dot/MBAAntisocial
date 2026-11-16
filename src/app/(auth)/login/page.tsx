'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Mail, KeyRound, AlertCircle, MailCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
import { api } from '@/lib/client/api';
import styles from '../auth.module.css';

/**
 * `useSearchParams` opts a route out of static prerendering unless the reading
 * component sits behind a Suspense boundary, so the form is split out and the
 * page renders a skeleton around it.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className={styles.formBody}><div className="skeleton" style={{ height: 320 }} /></div>}>
      <LoginForm />
    </Suspense>
  );
}

/**
 * Only same-origin paths are honoured. `callbackUrl` arrives in the query
 * string, so following it blindly would let a crafted link bounce a freshly
 * signed-in user to any site.
 */
function safeCallback(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/home';
  }
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  const justVerified = searchParams.get('verified') === '1';
  const justReset = searchParams.get('reset') === '1';

  const resend = async () => {
    try {
      await api.post('/api/auth/verify/resend', { email: email.trim() });
    } finally {
      // Same confirmation either way; the endpoint does not say who exists.
      setResent(true);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setUnverified(false);
    setResent(false);

    const result = await signIn('credentials', {
      email: email.trim(),
      password,
      redirect: false,
    });

    if (result?.error && result.code === 'unverified') {
      setUnverified(true);
      setPending(false);
      return;
    }

    if (result?.error && (result.code === 'suspended' || result.code === 'rate_limited')) {
      setError(
        result.code === 'suspended'
          ? 'This account is suspended. Contact your campus moderator.'
          : 'Too many attempts. Wait a few minutes, then try again.'
      );
      setPending(false);
      return;
    }

    if (result?.error) {
      /*
       * One message for both "no such account" and "wrong password". Splitting
       * them would let anyone check which addresses are registered here.
       */
      setError('That email and password combination did not work.');
      setPending(false);
      return;
    }

    // `refresh()` first so the server components pick up the new session
    // before the dashboard route renders.
    router.refresh();
    router.push(safeCallback(searchParams.get('callbackUrl')));
  };

  return (
    <div className={styles.formBody}>
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.subtitle}>
        Pick up where you left off — your slots, deadlines, and batch are waiting.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {justVerified && !error && !unverified && (
          <Banner variant="success" icon={<MailCheck size={16} />}>
            Email confirmed. Sign in to get started.
          </Banner>
        )}

        {justReset && !error && (
          <Banner variant="success" icon={<KeyRound size={16} />}>
            Password updated. Sign in with the new one.
          </Banner>
        )}

        {error && (
          <Banner variant="danger" icon={<AlertCircle size={16} />}>
            {error}
          </Banner>
        )}

        {unverified && (
          <Banner
            variant="warning"
            icon={<Mail size={16} />}
            title="Confirm your email first"
            action={
              resent ? undefined : (
                <Button type="button" size="sm" variant="secondary" onClick={resend}>
                  Send the link again
                </Button>
              )
            }
          >
            {resent
              ? 'Sent. Check your inbox, and the spam folder while you are there.'
              : 'We emailed you a confirmation link when you signed up. Follow it, then sign in.'}
          </Banner>
        )}

        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@institute.ac.in"
          icon={<Mail size={15} />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />

        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Your password"
          icon={<KeyRound size={15} />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Sign in
        </Button>
      </form>

      <p className={styles.footerNote}>
        New here? <Link href="/register">Create an account</Link>
        {' · '}
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
    </div>
  );
}
