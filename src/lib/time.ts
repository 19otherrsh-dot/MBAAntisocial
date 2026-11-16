/**
 * Calendar arithmetic in the campus time zone.
 *
 * A server has no idea where its users are: on most hosts the process clock is
 * UTC, so `setHours(23, 59)` means 05:29 the next morning in India, a "day"
 * rolls over at half past five, and a notification that says "7:00 PM" is five
 * and a half hours out. Everything that depends on *which day it is* goes
 * through here instead of through the process's local time.
 *
 * Pure functions with no imports, so both the server and the browser can use
 * them — and so they can be tested without a database.
 */

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

/**
 * The campus zone. Read straight from `process.env` rather than from the
 * validated `env` module, which is server-only and would throw in a browser
 * bundle. `APP_TIME_ZONE` is validated at boot in `env.ts`.
 */
export const APP_TIME_ZONE: string =
  (typeof process !== 'undefined' && process.env?.APP_TIME_ZONE) || DEFAULT_TIME_ZONE;

export const DAY_MS = 86_400_000;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The wall-clock reading of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone: string = APP_TIME_ZONE): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(date)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

/** Milliseconds `timeZone` is ahead of UTC at the instant `date`. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second noise so the offset is a clean number of seconds.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `timeZone` reads the given fields.
 * Fields may overflow (`day: 32`, `hour: 24`), as with `Date.UTC`.
 */
export function zonedTime(
  fields: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number; ms?: number },
  timeZone: string = APP_TIME_ZONE
): Date {
  const wall = Date.UTC(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour ?? 0,
    fields.minute ?? 0,
    fields.second ?? 0,
    fields.ms ?? 0
  );
  // Two passes: the offset depends on the instant, which depends on the
  // offset. One correction is enough everywhere except inside a DST gap.
  let guess = wall - offsetMs(new Date(wall), timeZone);
  guess = wall - offsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** Calendar day key, `YYYY-MM-DD`, as the campus sees it. */
export function dayKey(date: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  const p = zonedParts(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Whole calendar days from day key `a` to day key `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** Midnight at the start of the campus day containing `date`, shifted by `addDays`. */
export function startOfDay(date: Date = new Date(), addDays = 0, timeZone: string = APP_TIME_ZONE): Date {
  const p = zonedParts(date, timeZone);
  return zonedTime({ year: p.year, month: p.month, day: p.day + addDays }, timeZone);
}

/** The last millisecond of the campus day containing `date`. */
export function endOfDay(date: Date = new Date(), addDays = 0, timeZone: string = APP_TIME_ZONE): Date {
  return new Date(startOfDay(date, addDays + 1, timeZone).getTime() - 1);
}

/** Day of the week in the campus zone: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: Date, timeZone: string = APP_TIME_ZONE): number {
  return zonedParts(date, timeZone).weekday;
}

/** Monday 00:00 of the campus week containing `date`. */
export function startOfWeek(date: Date = new Date(), timeZone: string = APP_TIME_ZONE): Date {
  const sinceMonday = (weekdayOf(date, timeZone) + 6) % 7;
  return startOfDay(date, -sinceMonday, timeZone);
}
