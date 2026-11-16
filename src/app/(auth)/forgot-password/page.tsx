'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, MailCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
import { api, errorMessage } from '@/lib/client/api';
import styles from '../auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post('/api/auth/password/forgot', { email: email.trim() });
      setSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.formBody}>
      <h1 className={styles.title}>Reset your password</h1>
      <p className={styles.subtitle}>
        Enter the address you signed up with and we will email you a link to choose a new one.
      </p>

      {sent ? (
        <Banner variant="success" icon={<MailCheck size={16} />} title="Check your inbox">
          If that address has an account, a reset link is on its way. It works for one hour.
        </Banner>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {error && <Banner variant="danger">{error}</Banner>}
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
          <Button type="submit" size="lg" fullWidth loading={pending}>
            Email me a reset link
          </Button>
        </form>
      )}

      <p className={styles.footerNote}>
        Remembered it? <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
