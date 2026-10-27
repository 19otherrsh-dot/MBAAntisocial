export const metadata = { title: 'Offline' };

/** Served by the service worker when a navigation fails for lack of network. */
export default function OfflinePage() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ maxWidth: 380 }}>
        <h1 style={{ fontSize: 24, fontWeight: 680, letterSpacing: '-0.02em' }}>You’re offline</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6 }}>
          Antisocial even by our standards. Reconnect and pull to refresh — nothing you did is lost.
        </p>
      </div>
    </main>
  );
}
