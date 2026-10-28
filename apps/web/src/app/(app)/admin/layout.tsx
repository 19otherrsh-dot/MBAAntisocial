import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Platform admin' };

/** Sets the tab title; the pages below are client components and cannot export metadata. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
