import Link from 'next/link';
import { Home } from 'lucide-react';
import Button from '@/components/ui/Button';
import { LogoMark } from '@/components/brand/Logo';

export const metadata = { title: 'Not found' };

export default function NotFound() {
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
      <h1 style={{ fontSize: 'var(--t-2xl)' }}>Nothing here</h1>
      <p className="muted" style={{ maxWidth: '42ch', lineHeight: 1.6 }}>
        This page does not exist, or it was scoped to a campus that is not yours.
      </p>
      <Link href="/home">
        <Button icon={<Home size={16} />}>Back to Today</Button>
      </Link>
    </div>
  );
}
