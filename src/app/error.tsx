'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, Home } from 'lucide-react';
import Button from '@/components/ui/Button';
import { LogoMark } from '@/components/brand/Logo';

/**
 * Route-level error boundary. Shows a recoverable state rather than a blank
 * page, and keeps the failure detail off screen — `error.message` from a server
 * component can carry internals a user should not see.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] render error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--s-4)',
        padding: 'var(--s-5)',
        textAlign: 'center',
      }}
    >
      <LogoMark size={40} />
      <h1 style={{ fontSize: 'var(--t-2xl)' }}>That did not load</h1>
      <p className="muted" style={{ maxWidth: '46ch', lineHeight: 1.6 }}>
        Something broke on our side rather than yours. Try again — if it keeps happening, the
        reference below will help us find it.
      </p>
      {error.digest && (
        <code
          className="dim"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--t-xs)' }}
        >
          {error.digest}
        </code>
      )}
      <div className="row gap-3 wrap" style={{ justifyContent: 'center' }}>
        <Button icon={<RotateCcw size={16} />} onClick={reset}>
          Try again
        </Button>
        <Link href="/home">
          <Button variant="secondary" icon={<Home size={16} />}>
            Back to Today
          </Button>
        </Link>
      </div>
    </div>
  );
}
