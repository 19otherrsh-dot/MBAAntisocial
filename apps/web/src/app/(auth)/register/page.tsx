'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Mail, KeyRound, UserRound, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
import { api, ApiClientError } from '@/lib/client/api';
import { CAMPUSES, getBatchOptions } from '@/lib/constants';
import { cn } from '@/lib/utils';
import styles from '../auth.module.css';

const MIN_PASSWORD = 10;

/** Length-only strength cue — the rule the server actually enforces. */
function passwordStrength(password: string): { filled: number; label: string; tone: string } {
  if (password.length === 0) return { filled: 0, label: '', tone: 'var(--line)' };
  if (password.length < MIN_PASSWORD) return { filled: 1, label: 'Too short', tone: 'var(--rose)' };
  if (password.length < 14) return { filled: 2, label: 'Fine', tone: 'var(--amber)' };
  if (password.length < 20) return { filled: 3, label: 'Good', tone: 'var(--teal)' };
  return { filled: 4, label: 'Excellent', tone: 'var(--teal)' };
}

export default function RegisterPage() {
  const router = useRouter();
  const batches = useMemo(() => getBatchOptions(), []);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    campus: '',
    batch: batches[1],
    year: '1',
    isAlumni: false,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Typed per key, so the boolean `isAlumni` field does not need a cast at the
  // call site the way a blanket `string` signature forced.
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const strength = passwordStrength(form.password);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    try {
      await api.post('/api/auth/register', {
        ...form,
        year: Number(form.year),
      });

      // Sign in immediately — asking someone to type the same password again
      // on a separate screen is a step with no purpose.
      const result = await signIn('credentials', {
        email: form.email.trim(),
        password: form.password,
        redirect: false,
      });

      if (result?.error) {
        setError('Account created, but sign-in failed. Try signing in directly.');
        setPending(false);
        return;
      }

      router.refresh();
      router.push('/onboarding');
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setFieldErrors(caught.fieldErrors);
        // Field-level messages are shown inline; only show a banner when the
        // failure was not attributable to a specific input.
        if (Object.keys(caught.fieldErrors).length === 0) setError(caught.message);
      } else {
        setError('Something went wrong. Try again in a moment.');
      }
      setPending(false);
    }
  };

  return (
    <div className={styles.formBody}>
      <div className={styles.stepper}>
        <span className={cn(styles.stepDot, styles.stepDotActive)} />
        <span className={styles.stepDot} />
        <span>Step 1 of 2</span>
      </div>

      <h1 className={styles.title}>Set up your account</h1>
      <p className={styles.subtitle}>
        Your campus and batch decide whose slots you see and whose notes you get. Pick carefully.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {error && (
          <Banner variant="danger" icon={<AlertCircle size={16} />}>
            {error}
          </Banner>
        )}

        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="Ananya Raghavan"
          icon={<UserRound size={15} />}
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          error={fieldErrors.name}
          required
          autoFocus
        />

        <Input
          label="Institute email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@institute.ac.in"
          icon={<Mail size={15} />}
          value={form.email}
          onChange={(event) => set('email', event.target.value)}
          error={fieldErrors.email}
          hint="Used to verify you are actually on campus."
          required
        />

        <div>
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
            icon={<KeyRound size={15} />}
            value={form.password}
            onChange={(event) => set('password', event.target.value)}
            error={fieldErrors.password}
            hint="Length beats punctuation. A short phrase works better than a mangled word."
            required
          />
          {form.password.length > 0 && (
            <>
              <div className={styles.passwordMeter} aria-hidden>
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={styles.passwordSegment}
                    style={index < strength.filled ? { background: strength.tone } : undefined}
                  />
                ))}
              </div>
              <span
                className="dim"
                style={{ fontSize: 'var(--t-xs)', marginTop: 4, display: 'block' }}
              >
                {strength.label}
              </span>
            </>
          )}
        </div>

        <Select
          label="Campus"
          name="campus"
          value={form.campus}
          onChange={(event) => set('campus', event.target.value)}
          error={fieldErrors.campus}
          placeholder="Choose your institute"
          options={CAMPUSES.map((campus) => ({ value: campus, label: campus }))}
          required
        />

        <div className={styles.row}>
          <Select
            label="Batch"
            name="batch"
            value={form.batch}
            onChange={(event) => set('batch', event.target.value)}
            error={fieldErrors.batch}
            options={batches.map((batch) => ({ value: batch, label: batch }))}
          />
          <Select
            label="Year"
            name="year"
            value={form.year}
            onChange={(event) => set('year', event.target.value)}
            error={fieldErrors.year}
            options={[
              { value: '1', label: 'First year' },
              { value: '2', label: 'Second year' },
            ]}
            hint="Second years can host sessions."
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '-8px' }}>
          <input
            type="checkbox"
            id="isAlumni"
            checked={form.isAlumni}
            onChange={(e) => set('isAlumni', e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          <label htmlFor="isAlumni" style={{ fontSize: '0.875rem' }}>I am an Alumni (graduated)</label>
        </div>

        <Button type="submit" size="lg" fullWidth loading={pending}>
          Create account
        </Button>
      </form>

      <p className={styles.footerNote}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
