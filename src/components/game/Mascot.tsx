import styles from './game.module.css';

export type MascotMood = 'happy' | 'cheer' | 'wow' | 'proud' | 'sleepy' | 'focus';

/**
 * Notch — the app's mascot, grown out of the logo: the same block with its
 * corner bitten out, given a face and two stubby arms. Drawn in SVG so it
 * scales anywhere and takes the theme's colours.
 *
 * Purely decorative (`aria-hidden`); whatever it is reacting to is always said
 * in text next to it.
 */
export default function Mascot({
  mood = 'happy',
  size = 96,
  animate = true,
}: {
  mood?: MascotMood;
  size?: number;
  animate?: boolean;
}) {
  const armsUp = mood === 'cheer';
  const eyesClosed = mood === 'sleepy' || mood === 'proud';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
      className={[styles.mascot, animate && styles[`mascot_${mood}`]].filter(Boolean).join(' ')}
    >
      {/* Shadow */}
      <ellipse cx="60" cy="112" rx="30" ry="5" className={styles.mascotShadow} />

      {/* Arms, behind the body */}
      <g className={styles.mascotArms}>
        {armsUp ? (
          <>
            <path d="M24 58 Q12 40 16 26" className={styles.mascotLimb} />
            <path d="M96 58 Q108 40 104 26" className={styles.mascotLimb} />
          </>
        ) : (
          <>
            <path d="M24 66 Q12 72 14 84" className={styles.mascotLimb} />
            <path d="M96 66 Q108 72 106 84" className={styles.mascotLimb} />
          </>
        )}
      </g>

      {/* Body: the logo block with its bitten corner */}
      <g className={styles.mascotBody}>
        <path d="M22 34a14 14 0 0 1 14-14h40l22 22v48a14 14 0 0 1-14 14H36a14 14 0 0 1-14-14V34Z" className={styles.mascotFill} />
        <path d="M76 20l22 22H84a8 8 0 0 1-8-8V20Z" className={styles.mascotNotch} />
        {/* The off-grid node from the logo, now a little antenna */}
        <circle cx="100" cy="18" r="6" className={styles.mascotFill} />

        {/* Cheeks */}
        <circle cx="40" cy="70" r="5" className={styles.mascotCheek} />
        <circle cx="80" cy="70" r="5" className={styles.mascotCheek} />

        {/* Eyes */}
        {eyesClosed ? (
          <>
            <path d="M38 58 q6 -6 12 0" className={styles.mascotLine} />
            <path d="M70 58 q6 -6 12 0" className={styles.mascotLine} />
          </>
        ) : (
          <g className={styles.mascotEyes}>
            <ellipse cx="44" cy="58" rx={mood === 'wow' ? 8 : 7} ry={mood === 'wow' ? 9 : 8} fill="#fff" />
            <ellipse cx="76" cy="58" rx={mood === 'wow' ? 8 : 7} ry={mood === 'wow' ? 9 : 8} fill="#fff" />
            <circle cx={mood === 'focus' ? 46 : 45} cy={mood === 'focus' ? 60 : 59} r="3.6" className={styles.mascotPupil} />
            <circle cx={mood === 'focus' ? 78 : 77} cy={mood === 'focus' ? 60 : 59} r="3.6" className={styles.mascotPupil} />
            <circle cx="46.5" cy="56.5" r="1.3" fill="#fff" />
            <circle cx="78.5" cy="56.5" r="1.3" fill="#fff" />
          </g>
        )}

        {/* Mouth */}
        {mood === 'wow' ? (
          <ellipse cx="60" cy="78" rx="5" ry="6" className={styles.mascotMouth} />
        ) : mood === 'sleepy' ? (
          <path d="M54 78 h12" className={styles.mascotLine} />
        ) : mood === 'focus' ? (
          <path d="M53 78 q7 3 14 0" className={styles.mascotLine} />
        ) : (
          <path
            d={mood === 'cheer' ? 'M48 74 q12 16 24 0 Z' : 'M50 75 q10 9 20 0'}
            className={mood === 'cheer' ? styles.mascotMouth : styles.mascotLine}
          />
        )}

        {mood === 'sleepy' && (
          <text x="92" y="44" className={styles.mascotZ}>
            z
          </text>
        )}
      </g>
    </svg>
  );
}
