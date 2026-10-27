'use client';

import { useEffect, useRef } from 'react';

/**
 * Wraps a grid of cards. On fine pointers, the card under the cursor gets a
 * soft light that follows the pointer and a slight tilt toward it. One
 * delegated listener for the whole grid; nothing runs on touch devices or for
 * people who prefer less motion.
 */
export default function Spotlight({ children, className, selector = '[data-spot]' }: { children: React.ReactNode; className?: string; selector?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine) return;
    let active: HTMLElement | null = null;
    let raf = 0;
    let last: PointerEvent | null = null;

    const paint = () => {
      raf = 0;
      if (!active || !last) return;
      const rect = active.getBoundingClientRect();
      const x = (last.clientX - rect.left) / rect.width;
      const y = (last.clientY - rect.top) / rect.height;
      active.style.setProperty('--spot-x', `${(x * 100).toFixed(1)}%`);
      active.style.setProperty('--spot-y', `${(y * 100).toFixed(1)}%`);
      if (!calm) {
        active.style.setProperty('--tilt-x', `${((0.5 - y) * 5).toFixed(2)}deg`);
        active.style.setProperty('--tilt-y', `${((x - 0.5) * 5).toFixed(2)}deg`);
      }
    };
    const clear = (el: HTMLElement | null) => {
      if (!el) return;
      el.removeAttribute('data-spot-on');
      el.style.removeProperty('--tilt-x');
      el.style.removeProperty('--tilt-y');
    };
    const onMove = (event: PointerEvent) => {
      const card = (event.target as HTMLElement).closest<HTMLElement>(selector);
      const target = card && root.contains(card) ? card : null;
      if (target !== active) {
        clear(active);
        active = target;
        active?.setAttribute('data-spot-on', '');
      }
      last = event;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      clear(active);
      active = null;
    };
    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave);
    return () => {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [selector]);

  return (
    <div ref={ref} className={className} data-spotlight="">
      {children}
    </div>
  );
}
