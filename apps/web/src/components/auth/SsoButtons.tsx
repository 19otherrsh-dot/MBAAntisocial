'use client';

import { signIn } from 'next-auth/react';
import Button from '@/components/ui/Button';

const LABELS: Record<string, string> = {
  google: 'Continue with Google',
  'microsoft-entra-id': 'Continue with Microsoft',
  linkedin: 'Continue with LinkedIn',
};

/**
 * SSO buttons. Only providers configured on this deployment are passed in, and
 * every one of them is still held to the official-institute-email rule.
 */
export default function SsoButtons({
  providers,
  callbackUrl,
  className,
}: {
  providers: Array<{ id: string; name: string }>;
  callbackUrl: string;
  className?: string;
}) {
  if (providers.length === 0) return null;
  return (
    <div className={className}>
      {providers.map((p) => (
        <Button key={p.id} variant="secondary" fullWidth onClick={() => signIn(p.id, { callbackUrl })}>
          {LABELS[p.id] ?? `Continue with ${p.name}`}
        </Button>
      ))}
    </div>
  );
}
