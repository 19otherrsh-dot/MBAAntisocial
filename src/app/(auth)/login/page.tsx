'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Mail, KeyRound, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await signIn('credentials', {
      email: email.trim(),
      password,
      redirect: false,
    });

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
    router.push(searchParams.get('callbackUrl') ?? '/home');
  };

  return (
    <div className={styles.formBody}>
      <h1 className={styles.title}>Welcome back</h1>
      <p className={styles.subtitle}>
        Pick up where you left off — your slots, deadlines, and batch are waiting.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {error && (
          <Banner variant="danger" icon={<AlertCircle size={16} />}>
            {error}
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
      </p>
    </div>
  );
}
