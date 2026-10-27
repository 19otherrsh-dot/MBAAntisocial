/**
 * Minimal RFC 5545 writer: escaping, line folding, all-day and timed events,
 * zoned weekly recurrences. Enough for Google, Apple, and Outlook subscriptions.
 */
export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  /** A UTC instant, or a zoned local time for recurring classes. */
  start: Date | { local: string; timeZone: string };
  end: Date | { local: string; timeZone: string };
  allDay?: boolean;
  /** e.g. "FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231T000000Z" */
  rrule?: string;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines over 75 octets are folded with CRLF + space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = char;
    } else current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

function when(name: 'DTSTART' | 'DTEND', value: IcsEvent['start'], allDay?: boolean): string {
  if (value instanceof Date) return allDay ? `${name};VALUE=DATE:${dateOnly(value)}` : `${name}:${utc(value)}`;
  return `${name};TZID=${value.timeZone}:${value.local}`;
}

export function buildCalendar(name: string, events: IcsEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MBA Antisocial//Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  const stamp = utc(new Date());
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, when('DTSTART', e.start, e.allDay), when('DTEND', e.end, e.allDay), `SUMMARY:${escape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    if (e.status) lines.push(`STATUS:${e.status}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function icsResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, max-age=900',
    },
  });
}
