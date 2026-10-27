'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
import { api, ApiClientError, errorMessage } from '@/lib/client/api';
import styles from '../auth.module.css';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setFieldError('The two passwords don’t match.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.post('/api/auth/reset-password', { email, token, password });
      setDone(true);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.fieldErrors.password) setFieldError(caught.fieldErrors.password);
      else setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (!token || !email) {
    return (
      <div className={styles.formBody}>
        <h1 className={styles.title}>That link is incomplete</h1>
        <p className={styles.subtitle}>Open the reset link from your email again, or request a fresh one.</p>
        <p className={styles.footerNote}><Link href="/forgot-password">Request a new link</Link></p>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.formBody}>
        <div className={styles.statusArt}><CheckCircle2 size={26} /></div>
        <h1 className={styles.title}>Password updated</h1>
        <p className={styles.subtitle}>You can sign in with the new one now.</p>
        <Link href="/login" className="mt-4"><Button size="lg" fullWidth>Sign in</Button></Link>
      </div>
    );
  }

  return (
    <div className={styles.formBody}>
      <h1 className={styles.title}>Choose a new password</h1>
      <p className={styles.subtitle}>For {email}. At least 10 characters — a short phrase beats a mangled word.</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && <Banner variant="danger" icon={<AlertCircle size={16} />}>{error}</Banner>}
        <Input label="New password" type="password" autoComplete="new-password" icon={<KeyRound size={15} />} value={password}
          onChange={(e) => { setPassword(e.target.value); setFieldError(undefined); }} error={fieldError} required autoFocus />
        <Input label="Confirm password" type="password" autoComplete="new-password" icon={<KeyRound size={15} />} value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setFieldError(undefined); }} required />
        <Button type="submit" size="lg" fullWidth loading={pending}>Update password</Button>
      </form>
    </div>
  );
}
