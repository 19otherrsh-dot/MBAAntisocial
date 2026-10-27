'use client';

import { ViewTransition } from 'react';

/**
 * Marks an element that persists across a navigation — a game's art on the
 * card and on its page — so the browser glides it from one to the other
 * instead of cutting. Same `name` on both ends; nothing else needed.
 */
export default function Morph({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
