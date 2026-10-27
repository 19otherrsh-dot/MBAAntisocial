'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Mail, KeyRound, AlertCircle, Hash, Info } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Banner, Segmented } from '@/components/ui/Display';
import SsoButtons from '@/components/auth/SsoButtons';
import { api, errorMessage } from '@/lib/client/api';
import styles from '../auth.module.css';

const ERRORS: Record<string, string> = {
  sso_domain: 'That account isn’t on an official institute domain. Sign in with your college email.',
  sso_unverified: 'Your provider hasn’t verified that email address yet.',
  sso_suspended: 'This account is suspended. Contact your campus moderator.',
  sso_no_email: 'Your provider didn’t share an email address, so we can’t place you on a campus.',
  sso_cancelled: 'Sign-in was cancelled.',
  handoff: 'That sign-in link expired. Try again from the app.',
  CredentialsSignin: 'That didn’t work. Check the details and try again.',
};

type Mode = 'password' | 'code';

export default function LoginForm({ providers }: { providers: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/home';
  const initialError = searchParams.get('error');

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ? (ERRORS[initialError] ?? 'Sign-in failed.') : null);
  const [pending, setPending] = useState(false);

  const finish = () => {
    // `refresh()` first so the server components pick up the new session.
    router.refresh();
    router.push(callbackUrl);
  };

  const submitPassword = async () => {
    const result = await signIn('credentials', { email: email.trim(), password, redirect: false });
    if (result?.error) {
      // One message for both "no such account" and "wrong password", so the
      // form cannot be used to check which addresses are registered.
      setError('That email and password combination did not work.');
      return false;
    }
    return true;
  };

  const requestCode = async () => {
    const result = await api.post<{ sent: boolean; devCode?: string }>('/api/auth/otp', { email: email.trim() });
    setCodeSent(true);
    setDevHint(result.devCode ? `Development mode: your code is ${result.devCode}` : null);
  };

  const submitCode = async () => {
    const result = await signIn('otp', { email: email.trim(), code: code.trim(), redirect: false });
    if (result?.error) {
      setError('That code is wrong or has expired. Request a new one.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === 'password') {
        if (await submitPassword()) return finish();
      } else if (!codeSent) {
        await requestCode();
      } else if (await submitCode()) {
        return finish();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
    setPending(false);
  };

  return (
    <div className={styles.formBody}>
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.subtitle}>Pick up where you left off — your slots, deadlines, and batch are waiting.</p>

      <SsoButtons providers={providers} callbackUrl={callbackUrl} className={styles.ssoList} />
      {providers.length > 0 && <div className={styles.divider}>or with your institute email</div>}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Segmented
          ariaLabel="Sign-in method"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setError(null);
          }}
          options={[
            { value: 'password' as const, label: 'Password' },
            { value: 'code' as const, label: 'Email me a code' },
          ]}
        />

        {error && (
          <Banner variant="danger" icon={<AlertCircle size={16} />}>
            {error}
          </Banner>
        )}
        {devHint && (
          <Banner variant="info" icon={<Info size={16} />}>
            {devHint}
          </Banner>
        )}

        <Input
          label="Institute email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@institute.ac.in"
          icon={<Mail size={15} />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
          disabled={mode === 'code' && codeSent}
        />

        {mode === 'password' ? (
          <>
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
            <div className={styles.linkRow}>
              <span />
              <Link href="/forgot-password">Forgot password?</Link>
            </div>
          </>
        ) : (
          codeSent && (
            <>
              <Input
                label="6-digit code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                icon={<Hash size={15} />}
                className={styles.codeInput}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                hint={`Sent to ${email}. It expires in 10 minutes.`}
                autoFocus
              />
              <div className={styles.linkRow}>
                <button type="button" className={styles.textButton} onClick={() => { setCodeSent(false); setCode(''); setDevHint(null); }}>
                  Use a different email
                </button>
                <button type="button" className={styles.textButton} onClick={() => requestCode().catch((e) => setError(errorMessage(e)))}>
                  Resend code
                </button>
              </div>
            </>
          )
        )}

        <Button type="submit" size="lg" fullWidth loading={pending}>
          {mode === 'password' ? 'Sign in' : codeSent ? 'Verify & sign in' : 'Send code'}
        </Button>
      </form>

      <p className={styles.footerNote}>
        New here? <Link href="/register">Create an account</Link>
      </p>
    </div>
  );
}
