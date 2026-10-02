/** Presentation helpers shared by client and server components. */

/**
 * Joins truthy class names.
 *
 * Accepts any falsy value rather than just `false | null | undefined`, because
 * guards written as `icon && styles.hasIcon` narrow to whatever the left-hand
 * operand was — often `0` or `''` — and rejecting those would only push callers
 * into wrapping every guard in `Boolean(...)`.
 */
export function cn(...classes: Array<string | number | bigint | false | null | undefined>): string {
  return classes.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
}

const LOCALE = 'en-IN';

/** Relative time, e.g. "just now", "4h ago", "12 Mar". */
export function timeAgo(input: Date | string): string {
  const date = new Date(input);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;

  return date.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

export function formatDate(input: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(input).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
}

export function formatTime(input: Date | string): string {
  return new Date(input).toLocaleTimeString(LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** "Tue, 12 Mar · 4:30 PM". */
export function formatDateTime(input: Date | string): string {
  const date = new Date(input);
  const day = date.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${formatTime(date)}`;
}

/** "4:30 PM – 5:15 PM". */
export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDuration(start: Date | string, end: Date | string): string {
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Calendar-day label: "Today", "Tomorrow", or a date. */
export function formatDayLabel(input: Date | string): string {
  const date = new Date(input);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(date) - startOf(today)) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return date.toLocaleDateString(LOCALE, { weekday: 'long' });
  return formatDate(date);
}

export type Urgency = 'none' | 'safe' | 'soon' | 'urgent' | 'overdue';

/** Countdown text plus a severity band for styling. */
export function describeDeadline(due?: Date | string | null): { text: string; urgency: Urgency } {
  if (!due) return { text: 'No deadline', urgency: 'none' };

  const diffMs = new Date(due).getTime() - Date.now();
  if (diffMs < 0) {
    const overdueDays = Math.floor(-diffMs / 86_400_000);
    if (overdueDays >= 1) return { text: `${overdueDays}d overdue`, urgency: 'overdue' };
    return { text: 'Overdue', urgency: 'overdue' };
  }

  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(hours / 24);

  if (days >= 7) return { text: `${days}d left`, urgency: 'safe' };
  if (days >= 3) return { text: `${days}d left`, urgency: 'safe' };
  if (days >= 1) return { text: `${days}d left`, urgency: 'soon' };
  if (hours >= 1) return { text: `${hours}h left`, urgency: 'urgent' };
  return { text: 'Due within the hour', urgency: 'urgent' };
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Up to two initials, used for avatar fallbacks. */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Stable colour index for an identifier, so a given person keeps the same
 * avatar tint across sessions and devices.
 */
export function hashToIndex(value: string, buckets: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % buckets;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 100_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 100_000).toFixed(1)}L`;
}

/** Pluralises a noun against a count: `pluralise(1, 'session')` → "1 session". */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** `datetime-local` input value for a Date, in local time. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Hostname of a URL, for rendering link chips. Falls back to the raw string. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
