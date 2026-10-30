import type { Metadata } from 'next';
import { detailTitle } from '@/server/modules/meta/titles';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const title = await detailTitle('company', (await params).key);
  // No title means the section's own (from the parent layout) stays in place.
  return title ? { title: { absolute: `${title} · MBAAntisocial` } } : {};
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
