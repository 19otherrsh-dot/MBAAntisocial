interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * The brand mark: a filled square with a notch bitten out of its top-right
 * corner and an offset dot sitting outside the grid.
 *
 * The visual argument of the product in one glyph — an org chart with a piece
 * deliberately missing, and the one node that refused to line up.
 */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="MBAAntisocial"
    >
      <path
        d="M4 8.5A4.5 4.5 0 0 1 8.5 4H20l8 8v11.5a4.5 4.5 0 0 1-4.5 4.5H8.5A4.5 4.5 0 0 1 4 23.5v-15Z"
        fill="currentColor"
      />
      {/* The bitten corner, punched through so the canvas shows behind it. */}
      <path d="M20 4l8 8h-5.5A2.5 2.5 0 0 1 20 9.5V4Z" fill="var(--bg)" />
      {/* The node that sits outside the block. */}
      <circle cx="25.5" cy="6.5" r="3" fill="var(--bg)" />
      <circle cx="25.5" cy="6.5" r="1.75" fill="currentColor" />
    </svg>
  );
}

interface WordmarkProps {
  className?: string;
  /** Renders the mark alongside the name. */
  showMark?: boolean;
  size?: number;
}

export function Wordmark({ className, showMark = true, size = 24 }: WordmarkProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
    >
      {showMark && <LogoMark size={size} className="logo-mark" />}
      <span
        style={{
          fontWeight: 680,
          letterSpacing: '-0.035em',
          fontSize: `${size * 0.72}px`,
          whiteSpace: 'nowrap',
        }}
      >
        MBA<span style={{ color: 'var(--accent)' }}>Antisocial</span>
      </span>
    </span>
  );
}
