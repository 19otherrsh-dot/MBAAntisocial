import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/brand/Logo';

/**
 * Legal pages are outside the app shell so they can be read before signing in —
 * which matters, since accepting the sharing policy is a precondition for
 * uploading anything.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: '1px solid var(--line)',
          padding: 'var(--s-4) var(--s-5)',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--content-max)',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--s-4)',
          }}
        >
          <Link href="/" aria-label="MBAAntisocial home">
            <Wordmark size={24} />
          </Link>
          <Link
            href="/home"
            className="row gap-2 muted"
            style={{ fontSize: 'var(--t-sm)', fontWeight: 550 }}
          >
            <ArrowLeft size={15} />
            Back to the app
          </Link>
        </div>
      </header>

      <main
        style={{
          maxWidth: '760px',
          width: '100%',
          margin: '0 auto',
          padding: 'var(--s-7) var(--s-5) var(--s-8)',
        }}
      >
        {children}
      </main>
    </div>
  );
}
