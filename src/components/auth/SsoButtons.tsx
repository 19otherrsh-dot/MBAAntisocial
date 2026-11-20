'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import Button from '@/components/ui/Button';
import styles from './sso.module.css';

interface ProviderInfo {
  id: string;
  label: string;
}

/** Brand-neutral marks: a letter in a circle, so no third-party artwork is copied. */
function Mark({ id }: { id: string }) {
  return (
    <span className={styles.mark} aria-hidden>
      {id === 'google' ? 'G' : id.startsWith('microsoft') ? 'M' : id[0]?.toUpperCase()}
    </span>
  );
}

/**
 * "Continue with …" for each identity provider the deployment has switched on.
 * Renders nothing when none are, so the email form stands alone.
 */
export default function SsoButtons({ callbackUrl = '/home' }: { callbackUrl?: string }) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/sso-providers')
      .then((response) => response.json())
      .then((data: { providers: ProviderInfo[] }) => {
        if (!cancelled) setProviders(data.providers ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (providers.length === 0) return null;

  return (
    <div className={styles.group}>
      {providers.map((provider) => (
        <Button
          key={provider.id}
          type="button"
          variant="secondary"
          size="lg"
          fullWidth
          loading={pending === provider.id}
          icon={<Mark id={provider.id} />}
          onClick={() => {
            setPending(provider.id);
            void signIn(provider.id, { callbackUrl });
          }}
        >
          Continue with {provider.label}
        </Button>
      ))}
      <div className={styles.divider}>
        <span>or with email</span>
      </div>
    </div>
  );
}
