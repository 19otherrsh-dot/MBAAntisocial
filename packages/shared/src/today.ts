/**
 * The Today screen's wire contract (GET /api/today), shared by the web app and
 * the native app. Cards are optional: each appears only when the caller's
 * edition includes it and it loaded.
 */

export interface PersonRef {
  id: string;
  name: string;
  image?: string;
}

export interface TodayClass {
  slotId: string;
  courseId: string;
  name: string;
  code: string;
  color: string;
  start: string;
  end: string;
  room: string;
  kind: string;
  status: 'present' | 'absent' | 'cancelled' | null;
  /** Local calendar day, YYYY-MM-DD, to mark attendance against. */
  day: string;
}

export interface TodayCards {
  classes: TodayClass[];
  tasks: {
    items: Array<{ id: string; title: string; course: string; type: string; dueAt: string | null; overdue: boolean }>;
    overdue: number;
    dueToday: number;
    pending: number;
  };
  agenda: Array<
    | { kind: 'session'; id: string; startAt: string; endAt: string; sessionType: string; role: 'host' | 'guest'; with: PersonRef | null }
    | { kind: 'round'; id: string; startAt: string; company: string; label: string; roundType: string }
  >;
  briefing: { day: string; count: number; headline: { title: string; source: string; url: string } | null };
  quiz: { ready: boolean; played: boolean; score: number | null; total: number };
  checkIn: { done: boolean };
  events: Array<{ id: string; title: string; startAt: string; endAt: string; venue: string; category: string; going: boolean; goingCount: number }>;
  comps: Array<{ id: string; title: string; host: string; registrationDeadline: string }>;
  games: Array<{ id: string; game: string; gameName: string; status: string; tournament: boolean }>;
  openEdition: { crossCampusSlots: number };
}

export interface TodayResponse {
  timeZone: string;
  dayKey: string;
  generatedAt: string;
  edition: 'open' | 'campus' | 'none';
  cards: Partial<TodayCards>;
  /** Cards that failed to load this time; the rest still render. */
  failed: string[];
}
