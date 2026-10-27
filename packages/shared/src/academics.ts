/**
 * Pure academic arithmetic: attendance thresholds, GPA, and "what do I need
 * on the final". Shared by the web app, the native app, and tests.
 */

/* ───────────────────────── Attendance ───────────────────────── */

export interface AttendanceTally {
  attended: number;
  missed: number;
  /** Sessions still to come this term (if known). */
  remaining?: number;
}

export interface AttendanceOutlook {
  /** Current percentage, 0–100 (100 when nothing has happened yet). */
  percent: number;
  /** Classes that can be missed in a row from now and still end at or above the bar. */
  canSkip: number;
  /** Consecutive classes needed to climb back to the bar (0 when already there). */
  mustAttend: number;
  /** With `remaining` known: the best and worst finishing percentage. */
  bestCase?: number;
  worstCase?: number;
  /** Can the bar still be reached by the end of term at all? */
  recoverable: boolean;
}

export function attendanceOutlook(tally: AttendanceTally, requiredPercent: number): AttendanceOutlook {
  const req = Math.min(100, Math.max(0, requiredPercent)) / 100;
  const held = tally.attended + tally.missed;
  const percent = held === 0 ? 100 : (tally.attended / held) * 100;

  // attended / (held + k) >= req  →  k <= attended / req - held
  let canSkip = req === 0 ? Infinity : Math.floor(tally.attended / req - held + 1e-9);
  // (attended + k) / (held + k) >= req  →  k >= (req*held - attended) / (1 - req)
  let mustAttend = req >= 1 ? (tally.missed > 0 ? Infinity : 0) : Math.ceil((req * held - tally.attended) / (1 - req) - 1e-9);
  canSkip = Math.max(0, canSkip);
  mustAttend = Math.max(0, mustAttend);

  const outlook: AttendanceOutlook = { percent: round1(percent), canSkip: Number.isFinite(canSkip) ? canSkip : 999, mustAttend, recoverable: true };

  if (tally.remaining !== undefined) {
    const total = held + tally.remaining;
    outlook.bestCase = total === 0 ? 100 : round1(((tally.attended + tally.remaining) / total) * 100);
    outlook.worstCase = total === 0 ? 100 : round1((tally.attended / total) * 100);
    outlook.recoverable = (outlook.bestCase ?? 100) >= requiredPercent;
    outlook.canSkip = Math.min(outlook.canSkip, tally.remaining);
    if (!Number.isFinite(mustAttend) || mustAttend > tally.remaining) outlook.mustAttend = tally.remaining;
  } else if (!Number.isFinite(mustAttend)) {
    outlook.recoverable = false;
    outlook.mustAttend = 0;
  }
  return outlook;
}

/* ───────────────────────── Grades ───────────────────────── */

/** Common Indian B-school letter scales. Campuses can override. */
export const GRADE_SCALES = {
  '4.33': { label: '4.33 (A+ to F)', max: 4.33, grades: { 'A+': 4.33, A: 4, 'A-': 3.67, 'B+': 3.33, B: 3, 'B-': 2.67, 'C+': 2.33, C: 2, 'C-': 1.67, D: 1, F: 0 } },
  '4': { label: '4.0', max: 4, grades: { A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, D: 1, F: 0 } },
  '10': { label: '10-point', max: 10, grades: { 'A+': 10, A: 9, 'B+': 8, B: 7, 'C+': 6, C: 5, D: 4, F: 0 } },
} as const;
export type GradeScaleKey = keyof typeof GRADE_SCALES;

export interface GradedCourse {
  credits: number;
  /** Grade points on the scale; null for courses without a final grade yet. */
  points: number | null;
}

/** Credit-weighted average over graded courses; null when nothing is graded. */
export function gpa(courses: GradedCourse[]): number | null {
  let credits = 0;
  let weighted = 0;
  for (const c of courses) {
    if (c.points === null || c.credits <= 0) continue;
    credits += c.credits;
    weighted += c.credits * c.points;
  }
  return credits === 0 ? null : Math.round((weighted / credits) * 100) / 100;
}

export interface Component {
  name: string;
  /** Percent of the course grade. */
  weight: number;
  /** Score obtained, out of `max`; undefined while pending. */
  score?: number;
  max: number;
}

export interface ComponentSummary {
  /** Weighted percent earned so far, out of the weight that has been graded. */
  earned: number;
  gradedWeight: number;
  pendingWeight: number;
  /** Earned percent of the graded part, 0–100. */
  currentPercent: number | null;
}

export function summariseComponents(components: Component[]): ComponentSummary {
  let earned = 0;
  let gradedWeight = 0;
  let pendingWeight = 0;
  for (const c of components) {
    if (c.score === undefined || c.score === null || c.max <= 0) pendingWeight += c.weight;
    else {
      gradedWeight += c.weight;
      earned += (Math.min(c.score, c.max) / c.max) * c.weight;
    }
  }
  return {
    earned: round1(earned),
    gradedWeight,
    pendingWeight,
    currentPercent: gradedWeight > 0 ? round1((earned / gradedWeight) * 100) : null,
  };
}

/**
 * Percent needed across the pending components to finish at `target` percent.
 * Over 100 means out of reach; 0 or less means already secured.
 */
export function neededOnRemaining(components: Component[], target: number): number | null {
  const { earned, pendingWeight } = summariseComponents(components);
  if (pendingWeight <= 0) return null;
  return round1(((target - earned) / pendingWeight) * 100);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/* ───────────────────────── Timetable ───────────────────────── */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** "09:30" → minutes after midnight; null for malformed input. */
export function parseClock(value: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Monday = 0 … Sunday = 6, for a JS Date in a given IANA zone. */
export function weekdayIndex(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(date);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(name);
}

/** Two slots on the same day overlap? */
export function overlaps(a: { day: number; start: string; end: string }, b: { day: number; start: string; end: string }): boolean {
  if (a.day !== b.day) return false;
  const [as, ae, bs, be] = [parseClock(a.start), parseClock(a.end), parseClock(b.start), parseClock(b.end)];
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae;
}
