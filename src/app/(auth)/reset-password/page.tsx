'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import styles from '../auth.module.css';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className={styles.formBody}><div className="skeleton" style={{ height: 260 }} /></div>}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldError(undefined);
    try {
      await api.post('/api/auth/password/reset', { token, password });
      router.push('/login?reset=1');
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors.password) {
        setFieldError(caught.fieldErrors.password);
      } else {
        setError(errorMessage(caught));
      }
      setPending(false);
    }
  };

  if (!token) {
    return (
      <div className={styles.formBody}>
        <h1 className={styles.title}>That link is incomplete</h1>
        <p className={styles.subtitle}>
          Open the link from the email again, or <Link href="/forgot-password">ask for a new one</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.formBody}>
      <h1 className={styles.title}>Choose a new password</h1>
      <p className={styles.subtitle}>
        At least ten characters. Saving it signs you out everywhere else.
      </p>

      {/*
         * `method="post"`: if this is submitted before JavaScript has loaded —
         * a slow phone on campus Wi-Fi — the browser's default GET would put
         * the password in the address bar, history, and server logs.
         */}
      <form className={styles.form} onSubmit={handleSubmit} method="post" noValidate>
        {error && (
          <Banner variant="danger" icon={<AlertCircle size={16} />}>
            {error} <Link href="/forgot-password">Get a new link</Link>
          </Banner>
        )}
        <Input
          label="New password"
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="Ten characters or more"
          icon={<KeyRound size={15} />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldError}
          required
          autoFocus
        />
        <Button type="submit" size="lg" fullWidth loading={pending}>
          Save password
        </Button>
      </form>
    </div>
  );
}
