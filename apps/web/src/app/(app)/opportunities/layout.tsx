import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Campus opportunities' };

/** Sets the tab title; the pages below are client components and cannot export metadata. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
