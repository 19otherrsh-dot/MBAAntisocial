/**
 * Calendar invites (RFC 5545). One `.ics` file works in Google Calendar,
 * Outlook, and Apple Calendar alike, with no OAuth and no per-provider code.
 */
export interface CalendarEvent {
  /** Stable across updates, so a rescheduled session replaces the old entry. */
  uid?: string;
  title: string;
  description: string;
  location?: string;
  url?: string;
  startTime: Date;
  endTime: Date;
  /** Bumped on each change; with the same uid, calendars update in place. */
  sequence?: number;
  cancelled?: boolean;
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/** Escapes text per RFC 5545: backslash, semicolon, comma, newline. */
function text(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();
/** UTF-8 length — works in the browser and on the server alike. */
const bytes = (value: string) => encoder.encode(value).length;

/** Folds content lines at 75 octets, as the spec requires. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (bytes(rest) > 75) {
    let cut = 75;
    while (bytes(rest.slice(0, cut)) > 75) cut -= 1;
    parts.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  parts.push(rest);
  return parts.join('\r\n');
}

export function generateIcs(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MBAAntisocial//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${event.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${event.uid ?? `${stamp(event.startTime)}-${Math.random().toString(36).slice(2)}@mbaantisocial`}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(event.startTime)}`,
    `DTEND:${stamp(event.endTime)}`,
    `SUMMARY:${text(event.title)}`,
    `DESCRIPTION:${text(event.description)}`,
    ...(event.location ? [`LOCATION:${text(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    `STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${text(event.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n');
}

/** Triggers a download of the .ics file in the browser. */
export function downloadIcs(event: CalendarEvent, filename: string = 'event.ics') {
  const blob = new Blob([generateIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/** A "save to Google Calendar" link, for people who would rather click than import. */
export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(event.startTime)}/${stamp(event.endTime)}`,
    details: event.description,
    ...(event.location ? { location: event.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
