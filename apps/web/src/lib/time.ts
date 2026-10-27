/**
 * Calendar days in a person's own time zone. Servers run in UTC; a student in
 * India lives 5½ hours ahead, so "today", "due tonight", and "this week" must
 * be computed in their zone, never the server's.
 */

export const DAY_MS = 86_400_000;
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

/** "2026-10-28": the calendar day `date` falls on in `timeZone`. */
export function dayKeyIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** How far `timeZone`'s wall clock is ahead of UTC at instant `at`, in ms. */
export function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(at)
    .reduce<Record<string, number>>((acc, p) => (p.type === 'literal' ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant local midnight begins the day `key` in `timeZone`. */
export function startOfLocalDay(key: string, timeZone: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Offset measured near the target day; re-measured once to settle DST edges.
  let start = utcMidnight - zoneOffsetMs(new Date(utcMidnight), timeZone);
  start = utcMidnight - zoneOffsetMs(new Date(start), timeZone);
  return new Date(start);
}

/** Start and end of the local day `now` falls in, as instants. */
export function localDayBounds(now: Date, timeZone: string): { dayKey: string; dayStart: Date; dayEnd: Date } {
  const dayKey = dayKeyIn(now, timeZone);
  const dayStart = startOfLocalDay(dayKey, timeZone);
  const next = startOfLocalDay(addDays(dayKey, 1), timeZone);
  return { dayKey, dayStart, dayEnd: new Date(next.getTime() - 1) };
}

/** Calendar arithmetic on day keys, independent of any zone. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a day key. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
