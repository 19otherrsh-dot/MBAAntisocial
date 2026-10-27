'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Mail, KeyRound, UserRound, AlertCircle, Building2, CheckCircle2, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Input, Select, Switch } from '@/components/ui/Field';
import { Banner } from '@/components/ui/Display';
import SsoButtons from '@/components/auth/SsoButtons';
import { api, ApiClientError } from '@/lib/client/api';
import { getBatchOptions } from '@/lib/constants';
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

type Resolution =
  | { kind: 'member'; campus: { name: string; status: string; shortName: string } }
  | { kind: 'requestable'; domain: string; suggestedName: string }
  | { kind: 'blocked'; reason: string };

const STATUS_COPY: Record<string, string> = {
  campus: 'Campus Edition is live here.',
  open: 'You’ll start on the Open Edition; campus features unlock as your batch joins.',
  requested: 'Your institute is waiting for approval — you’ll get the Open Edition meanwhile.',
};

/**
 * Sign-up. The campus is never picked from a list: it comes from the official
 * email address, which is checked as soon as the person leaves the field.
 */
export default function RegisterForm({ providers }: { providers: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const batches = useMemo(() => getBatchOptions(), []);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    batch: batches[1],
    year: '1',
    isAlumni: false,
    institutionName: '',
  });
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [checking, setChecking] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const checkEmail = async () => {
    const email = form.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    setChecking(true);
    try {
      const { resolution: next } = await api.post<{ resolution: Resolution }>('/api/auth/resolve-email', { email });
      setResolution(next);
      if (next.kind === 'requestable' && !form.institutionName) set('institutionName', next.suggestedName);
    } catch {
      setResolution(null);
    } finally {
      setChecking(false);
    }
  };

  const strength = passwordStrength(form.password);
  const blocked = resolution?.kind === 'blocked';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    setPending(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await api.post<{ devLink?: string }>('/api/auth/register', {
        ...form,
        year: Number(form.year),
        institutionName: resolution?.kind === 'requestable' ? form.institutionName : undefined,
      });

      // Sign in straight away; the app routes unverified accounts to the
      // "check your inbox" screen.
      const signed = await signIn('credentials', { email: form.email.trim(), password: form.password, redirect: false });
      if (signed?.error) {
        setError('Account created, but sign-in failed. Try signing in directly.');
        setPending(false);
        return;
      }

      if (result.devLink) sessionStorage.setItem('dev-verify-link', result.devLink);
      router.refresh();
      router.push('/verify-email');
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setFieldErrors(caught.fieldErrors);
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
        Use your official institute email — it decides your campus, so your batch stays your batch.
      </p>

      <SsoButtons providers={providers} callbackUrl="/onboarding" className={styles.ssoList} />
      {providers.length > 0 && <div className={styles.divider}>or sign up with email</div>}

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {error && (
          <Banner variant="danger" icon={<AlertCircle size={16} />}>
            {error}
          </Banner>
        )}

        <Input
          label="Institute email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@institute.ac.in"
          icon={<Mail size={15} />}
          value={form.email}
          onChange={(event) => {
            set('email', event.target.value);
            setResolution(null);
          }}
          onBlur={checkEmail}
          error={fieldErrors.email ?? (blocked ? resolution.reason : undefined)}
          hint={checking ? 'Checking your institute…' : 'Personal Gmail/Outlook addresses are not accepted.'}
          required
          autoFocus
        />

        {resolution?.kind === 'member' && (
          <div className={styles.detected}>
            <CheckCircle2 size={16} style={{ color: 'var(--teal)', flexShrink: 0 }} />
            <span>
              <strong>{resolution.campus.name}</strong> — {STATUS_COPY[resolution.campus.status] ?? ''}
            </span>
          </div>
        )}

        {resolution?.kind === 'requestable' && (
          <>
            <div className={styles.detected}>
              <Clock size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
              <span>
                We haven’t set up <strong>{resolution.domain}</strong> yet. Tell us the institute’s name and we’ll add it.
              </span>
            </div>
            <Input
              label="Institute name"
              name="institutionName"
              placeholder="e.g. Indian Institute of Management Udaipur"
              icon={<Building2 size={15} />}
              value={form.institutionName}
              onChange={(event) => set('institutionName', event.target.value)}
              error={fieldErrors.institutionName}
              required
            />
          </>
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
              <span className="dim" style={{ fontSize: 'var(--t-xs)', marginTop: 4, display: 'block' }}>
                {strength.label}
              </span>
            </>
          )}
        </div>

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

        <Switch
          checked={form.isAlumni}
          onChange={(checked) => set('isAlumni', checked)}
          label="I’ve graduated (alumni)"
          hint="Use your institute’s alumni address if you have one."
        />

        <Button type="submit" size="lg" fullWidth loading={pending} disabled={blocked}>
          Create account
        </Button>
      </form>

      <p className={styles.footerNote}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
