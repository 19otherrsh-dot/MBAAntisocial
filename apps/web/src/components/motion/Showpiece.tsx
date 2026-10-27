'use client';

import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './motion.module.css';

export interface ShowpieceProps {
  src: string;
  poster: string;
  alt: string;
  /** Horizontal orbit (degrees) as the piece scrolls from the bottom of the viewport to the top. */
  orbit: [number, number];
  /** Polar angle (degrees from straight above). */
  polar: number;
  radius: string;
  target?: string;
  fieldOfView?: string;
  exposure?: number;
  /** CSS aspect-ratio of the frame, matched by the poster render. */
  aspect: string;
  credit: { title: string; by: string; license: string; href: string };
  className?: string;
}

type ModelViewerElement = HTMLElement & { cameraOrbit: string; jumpCameraToGoal?: () => void };

/**
 * Whether this device should get the real-time model. A beautiful still is
 * better than a stuttering 3D scene, so the bar is deliberately high: no data
 * saver, no slow network, a reasonably modern device, and motion welcome.
 */
function canAffordModel(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if (nav.connection?.effectiveType && /(^|-)2g|3g/.test(nav.connection.effectiveType)) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false;
  if ((navigator.hardwareConcurrency ?? 8) < 4) return false;
  try {
    const canvas = document.createElement('canvas');
    if (!canvas.getContext('webgl2')) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * A photogrammetry-grade 3D object that turns as you scroll past it, and that
 * you can pick up and rotate. Until it is near the viewport — and on devices
 * that should not run it — a pre-rendered still stands in, so the page never
 * waits on it.
 */
export default function Showpiece({ src, poster, alt, orbit, polar, radius, target, fieldOfView = '30deg', exposure = 1, aspect, credit, className }: ShowpieceProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ModelViewerElement | null>(null);
  const [live, setLive] = useState(false);
  const [userDriven, setUserDriven] = useState(false);
  const userDrivenRef = useRef(false);

  // Load the viewer only when the piece is about to be seen, and only once.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !canAffordModel()) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        import('@google/model-viewer')
          .then(() => !cancelled && setLive(true))
          .catch(() => undefined);
      },
      { rootMargin: '200px' }
    );
    observer.observe(frame);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  // Scroll drives the orbit and the pointer leans it a few degrees, until the
  // viewer picks the piece up and rotates it themselves.
  useEffect(() => {
    if (!live) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const frame = frameRef.current;
    let raf = 0;
    let lean = { x: 0, y: 0 };
    const update = () => {
      raf = 0;
      const viewer = viewerRef.current;
      if (!viewer || !frame || userDrivenRef.current) return;
      const rect = frame.getBoundingClientRect();
      const progress = reduced ? 0.5 : Math.min(1, Math.max(0, (window.innerHeight - rect.top) / (window.innerHeight + rect.height)));
      const theta = orbit[0] + (orbit[1] - orbit[0]) * progress + lean.x * 10;
      const phi = polar + lean.y * 4;
      viewer.cameraOrbit = `${theta.toFixed(2)}deg ${phi.toFixed(2)}deg ${radius}`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onPointer = (event: PointerEvent) => {
      lean = { x: event.clientX / window.innerWidth - 0.5, y: event.clientY / window.innerHeight - 0.5 };
      schedule();
    };
    const viewer = viewerRef.current;
    const onCameraChange = (event: Event) => {
      if ((event as CustomEvent<{ source: string }>).detail?.source === 'user-interaction' && !userDrivenRef.current) {
        userDrivenRef.current = true;
        setUserDriven(true);
      }
    };
    update();
    // The app scrolls an inner container, not the window; capture catches any scroller.
    document.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
    if (finePointer && !reduced) window.addEventListener('pointermove', onPointer, { passive: true });
    viewer?.addEventListener('camera-change', onCameraChange);
    return () => {
      document.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointermove', onPointer);
      viewer?.removeEventListener('camera-change', onCameraChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [live, orbit, polar, radius, userDriven]);

  const giveBackToScroll = () => {
    userDrivenRef.current = false;
    setUserDriven(false);
  };

  return (
    <figure className={cn(styles.showpiece, className)}>
      <div ref={frameRef} className={styles.showpieceFrame} style={{ aspectRatio: aspect }}>
        {live ? (
          <model-viewer
            ref={(el: HTMLElement | null) => {
              viewerRef.current = el as ModelViewerElement | null;
            }}
            className={styles.viewer}
            src={src}
            poster={poster}
            alt={alt}
            camera-controls=""
            disable-zoom=""
            disable-pan=""
            touch-action="pan-y"
            interaction-prompt="none"
            camera-orbit={`${orbit[0]}deg ${polar}deg ${radius}`}
            min-camera-orbit="auto auto 20%"
            {...(target ? { 'camera-target': target } : {})}
            field-of-view={fieldOfView}
            interpolation-decay="120"
            shadow-intensity="0.9"
            shadow-softness="1"
            exposure={exposure}
            environment-image="neutral"
            tone-mapping="aces"
          />
        ) : (
          // A pre-rendered still of the same model: instant, and final on devices that skip 3D.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.viewer} src={poster} alt={alt} decoding="async" />
        )}
        {userDriven && (
          <button className={styles.showpieceReset} onClick={giveBackToScroll} aria-label="Let scrolling turn it again">
            <RotateCcw size={14} />
          </button>
        )}
      </div>
      <figcaption className={styles.credit}>
        <a href={credit.href} target="_blank" rel="noopener noreferrer">{credit.title}</a> by {credit.by} · {credit.license}
      </figcaption>
    </figure>
  );
}
