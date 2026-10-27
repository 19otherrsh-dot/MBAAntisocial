'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Banner } from '@/components/ui/Display';
import { useApiQuery } from '@/lib/client/hooks';
import { api } from '@/lib/client/api';
import { formatDate } from '@/lib/utils';

interface MeResponse {
  user: { honorCodeAcceptedAt: string | null };
}

/**
 * Records acceptance. Rendered as a client island so the policy text itself
 * stays a static server component and remains readable while signed out.
 */
export default function AcceptButton() {
  const router = useRouter();
  const { status } = useSession();

  // Passing `null` while signed out skips the request entirely, rather than
  // firing an authenticated call that is guaranteed to 401.
  const { data, loading } = useApiQuery<MeResponse>(
    status === 'authenticated' ? '/api/me' : null
  );

  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') {
    return <div className="skeleton" style={{ height: 56 }} />;
  }

  if (status === 'unauthenticated') {
    return (
      <Banner variant="info" icon={<ShieldCheck size={16} />}>
        Sign in to accept this. You only need to do it once.
      </Banner>
    );
  }

  if (loading) return <div className="skeleton" style={{ height: 56 }} />;

  // Local state wins once accepted here, so the banner flips without a refetch.
  const accepted = acceptedAt ?? data?.user.honorCodeAcceptedAt ?? null;

  if (accepted) {
    return (
      <Banner variant="success" icon={<ShieldCheck size={16} />}>
        Accepted on {formatDate(accepted)}. You can upload to the resource library.
      </Banner>
    );
  }

  const accept = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ honorCodeAcceptedAt: string }>('/api/me/honor-code', {
        accepted: true,
      });
      setAcceptedAt(result.honorCodeAcceptedAt);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="stack gap-3" style={{ marginTop: 'var(--s-4)' }}>
      {error && <Banner variant="danger">{error}</Banner>}
      <div>
        <Button size="lg" icon={<ShieldCheck size={17} />} onClick={accept} loading={pending}>
          I have read this and accept it
        </Button>
      </div>
    </div>
  );
}
