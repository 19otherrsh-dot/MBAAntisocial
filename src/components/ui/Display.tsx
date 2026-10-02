'use client';

import { cn, getInitials, hashToIndex } from '@/lib/utils';
import type { Tone } from '@/lib/constants';
import styles from './ui.module.css';

/* Presentational primitives: chips, avatars, stats, banners, empty states. */

const TONE_CLASS: Record<Tone, string> = {
  violet: styles.chipViolet,
  blue: styles.chipBlue,
  teal: styles.chipTeal,
  amber: styles.chipAmber,
  rose: styles.chipRose,
  slate: styles.chipSlate,
};

interface ChipProps {
  tone?: Tone;
  size?: 'sm' | 'lg';
  outline?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function Chip({ tone = 'slate', size = 'sm', outline, icon, children, className, title }: ChipProps) {
  return (
    <span
      className={cn(
        styles.chip,
        size === 'lg' && styles.chipLg,
        outline ? styles.chipOutline : TONE_CLASS[tone],
        className
      )}
      title={title}
    >
      {icon}
      {children}
    </span>
  );
}

/** Deterministic avatar tints, so a person keeps the same colour everywhere. */
const AVATAR_TONES: Tone[] = ['violet', 'blue', 'teal', 'amber', 'rose', 'slate'];

interface AvatarProps {
  name: string;
  image?: string;
  /** Stable colour seed; defaults to the name. */
  seed?: string;
  size?: number;
  className?: string;
}

export function Avatar({ name, image, seed, size = 36, className }: AvatarProps) {
  const tone = AVATAR_TONES[hashToIndex(seed ?? name, AVATAR_TONES.length)];

  return (
    <span
      className={cn(styles.avatar, TONE_CLASS[tone], className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      title={name}
    >
      {image ? (
        /* Avatars come from arbitrary user-supplied URLs. next/image would
           require every host to be allow-listed in next.config, which is not
           knowable for user-provided links. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className={styles.avatarImg} loading="lazy" decoding="async" />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

interface StatProps {
  value: React.ReactNode;
  label: string;
  meta?: React.ReactNode;
  tone?: Tone;
}

export function Stat({ value, label, meta, tone }: StatProps) {
  return (
    <div className={styles.stat}>
      <span
        className={styles.statValue}
        style={tone ? { color: `var(--${tone}-text)` } : undefined}
      >
        {value}
      </span>
      <span className={styles.statLabel}>{label}</span>
      {meta && <span className={styles.statMeta}>{meta}</span>}
    </div>
  );
}

interface ProgressProps {
  value: number;
  max: number;
  tone?: Tone;
  label?: string;
}

export function Progress({ value, max, tone, label }: ProgressProps) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className={styles.progressFill}
        style={{ width: `${pct}%`, ...(tone ? { background: `var(--${tone})` } : {}) }}
      />
    </div>
  );
}

interface BannerProps {
  variant?: 'info' | 'warning' | 'danger' | 'success';
  icon?: React.ReactNode;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

const BANNER_CLASS = {
  info: styles.bannerInfo,
  warning: styles.bannerWarning,
  danger: styles.bannerDanger,
  success: styles.bannerSuccess,
};

export function Banner({ variant = 'info', icon, title, children, action, className }: BannerProps) {
  return (
    <div className={cn(styles.banner, BANNER_CLASS[variant], className)}>
      {icon && <span className={styles.bannerIcon}>{icon}</span>}
      <div className="grow">
        {title && <div className={styles.bannerTitle}>{title}</div>}
        {children}
      </div>
      {action && <div className={styles.bannerAction}>{action}</div>}
    </div>
  );
}

interface EmptyStateProps {
  art?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}

export function EmptyState({ art, title, body, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {art && <div className={styles.emptyArt}>{art}</div>}
      <h3 className={styles.emptyTitle}>{title}</h3>
      {body && <p className={styles.emptyBody}>{body}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className={styles.segmented} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            className={cn(styles.segment, active && styles.segmentActive)}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span className={styles.segmentCount}>{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface RatingInputProps {
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  describedBy?: string;
}

/**
 * A 1–5 rating as labelled number buttons rather than stars. Stars invite an
 * everything-is-five reflex; a numbered scale reads as a judgement, which is
 * the point of a rubric.
 */
export function RatingInput({
  value,
  onChange,
  min = 1,
  max = 5,
  label,
  describedBy,
}: RatingInputProps) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className={styles.ratingRow} role="radiogroup" aria-label={label} aria-describedby={describedBy}>
      <div className={styles.ratingButtons}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            aria-label={`${option} out of ${max}`}
            className={cn(styles.ratingDot, value === option && styles.ratingDotActive)}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <span className={styles.ratingValue}>{value ? `${value}/${max}` : '—'}</span>
    </div>
  );
}
