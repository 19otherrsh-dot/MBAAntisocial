'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, AlertCircle, MailCheck, Info } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
import { api, errorMessage } from '@/lib/client/api';
import styles from '../auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ sent: boolean; devLink?: string }>('/api/auth/forgot-password', { email: email.trim() });
      setSent(true);
      setDevLink(result.devLink ?? null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div className={styles.formBody}>
        <div className={styles.statusArt}><MailCheck size={26} /></div>
        <h1 className={styles.title}>Check your inbox</h1>
        <p className={styles.subtitle}>
          If an account exists for <strong>{email}</strong>, a reset link is on its way. It works once and expires in 30 minutes.
        </p>
        {devLink && (
          <Banner variant="info" icon={<Info size={16} />} className="mt-4">
            Development mode — no mail provider configured. <a href={devLink}>Open the reset link</a>.
          </Banner>
        )}
        <p className={styles.footerNote}><Link href="/login">Back to sign in</Link></p>
      </div>
    );
  }

  return (
    <div className={styles.formBody}>
      <h1 className={styles.title}>Forgot your password?</h1>
      <p className={styles.subtitle}>No drama. Enter your institute email and we’ll send a reset link — or sign in with a one-time code instead.</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        {error && <Banner variant="danger" icon={<AlertCircle size={16} />}>{error}</Banner>}
        <Input
          label="Institute email"
          type="email"
          autoComplete="email"
          placeholder="you@institute.ac.in"
          icon={<Mail size={15} />}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />
        <Button type="submit" size="lg" fullWidth loading={pending}>Send reset link</Button>
      </form>
      <p className={styles.footerNote}><Link href="/login">Back to sign in</Link></p>
    </div>
  );
}
