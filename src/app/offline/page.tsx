import { WifiOff } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';

export const metadata = { title: 'Offline' };

/** Served by the service worker when a page is requested with no connection. */
export default function OfflinePage() {
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
      <WifiOff size={28} strokeWidth={1.6} aria-hidden style={{ color: 'var(--text-muted)' }} />
      <h1 style={{ fontSize: 'var(--t-2xl)' }}>You are offline</h1>
      <p className="muted" style={{ maxWidth: '42ch', lineHeight: 1.6 }}>
        Pages you opened recently still work. Everything else comes back the moment the campus
        Wi-Fi does.
      </p>
    </div>
  );
}
