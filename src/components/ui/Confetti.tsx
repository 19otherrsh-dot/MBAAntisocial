import styles from './confetti.module.css';

const COLOURS = ['var(--violet)', 'var(--teal)', 'var(--amber)', 'var(--rose)', 'var(--blue)'];
const PIECES = 42;

/**
 * A one-shot confetti burst, pure CSS.
 *
 * Each piece's position, drift, spin, and delay come from its index through a
 * fixed hash — not `Math.random()` — so rendering is deterministic (React's
 * purity rules, and no hydration mismatch) while still looking scattered.
 * Hidden entirely for anyone who has asked the OS for reduced motion.
 */
function spread(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export default function Confetti() {
  return (
    <div className={styles.burst} aria-hidden>
      {Array.from({ length: PIECES }, (_, index) => (
        <span
          key={index}
          className={styles.piece}
          style={
            {
              left: `${spread(index, 1) * 100}%`,
              background: COLOURS[index % COLOURS.length],
              '--drift': `${(spread(index, 2) - 0.5) * 160}px`,
              '--spin': `${(spread(index, 3) - 0.5) * 1440}deg`,
              '--fall': `${260 + spread(index, 4) * 220}px`,
              animationDelay: `${spread(index, 5) * 0.35}s`,
              width: `${6 + spread(index, 6) * 6}px`,
              height: `${8 + spread(index, 7) * 8}px`,
              borderRadius: index % 3 === 0 ? '50%' : '2px',
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
