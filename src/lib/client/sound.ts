'use client';

/**
 * Tiny synthesised sound effects — no audio files to download.
 *
 * Every sound follows something the user just did (a tap, a claim), so the
 * browser's autoplay rules never block it. Off by a toggle stored per device.
 */
export type SoundName = 'xp' | 'claim' | 'success' | 'level' | 'tap';

const STORAGE_KEY = 'sound-on';
let context: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return false;
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

function note(ctx: AudioContext, frequency: number, start: number, duration: number, type: OscillatorType, volume: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(ctx.currentTime + start);
  oscillator.stop(ctx.currentTime + start + duration + 0.02);
}

const PATTERNS: Record<SoundName, Array<[number, number, number, OscillatorType, number]>> = {
  // frequency, start, duration, wave, volume
  tap: [[660, 0, 0.06, 'sine', 0.04]],
  xp: [
    [880, 0, 0.08, 'sine', 0.06],
    [1320, 0.07, 0.12, 'sine', 0.06],
  ],
  claim: [
    [988, 0, 0.08, 'triangle', 0.08],
    [1319, 0.08, 0.22, 'triangle', 0.08],
  ],
  success: [
    [523, 0, 0.12, 'triangle', 0.07],
    [659, 0.1, 0.12, 'triangle', 0.07],
    [784, 0.2, 0.12, 'triangle', 0.07],
    [1047, 0.3, 0.32, 'triangle', 0.08],
  ],
  level: [
    [392, 0, 0.14, 'square', 0.035],
    [523, 0.12, 0.14, 'square', 0.035],
    [659, 0.24, 0.14, 'square', 0.035],
    [784, 0.36, 0.5, 'triangle', 0.08],
    [988, 0.36, 0.5, 'triangle', 0.05],
    [1175, 0.36, 0.5, 'triangle', 0.04],
  ],
};

export function playSound(name: SoundName): void {
  if (!soundEnabled()) return;
  const ctx = audio();
  if (!ctx) return;
  for (const [frequency, start, duration, type, volume] of PATTERNS[name]) {
    note(ctx, frequency, start, duration, type, volume);
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
  } catch {
    // Storage blocked: sounds simply stay at the default.
  }
}

export const SOUND_STORAGE_KEY = STORAGE_KEY;
