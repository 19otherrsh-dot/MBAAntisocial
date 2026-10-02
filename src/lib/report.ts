import User from '@/models/User';
import InterviewSlot from '@/models/InterviewSlot';
import Resource from '@/models/Resource';
import Application from '@/models/Application';
import InterviewQuestion from '@/models/InterviewQuestion';
import {
  MIN_REPORTABLE_COHORT,
  APPLICATION_STAGES,
  ROLE_TRACK_META,
  type ApplicationStage,
  type RoleTrack,
} from './constants';

/**
 * The campus report.
 *
 * Answers the one question a placement cell has that no incumbent system can:
 * *is this batch actually prepared*. The placement ERPs record outcomes — who
 * got which offer — which is only knowable after it is too late to act. These
 * figures are all leading indicators.
 *
 * Every breakdown passes through `suppress()`. Individual pipelines are private
 * by construction, and a thin aggregate leaks them straight back: on a small
 * campus, "one applicant to Company X, rejected" names that person as surely as
 * a list would.
 */

const DAY_MS = 86_400_000;

export interface Trend {
  label: string;
  value: number;
}

export interface FunnelStage {
  stage: ApplicationStage;
  label: string;
  count: number;
}

export interface CoverageGap {
  label: string;
  detail: string;
  severity: 'high' | 'medium';
}

export interface CampusReport {
  campus: string;
  generatedAt: string;
  cohort: { firstYears: number; secondYears: number; total: number; active30d: number };
  readiness: {
    studentsWithSession: number;
    readinessShare: number;
    completedSessions: number;
    noShows: number;
    openSlots: number;
    slotsNextFortnight: number;
  };
  supply: {
    hostingMentors: number;
    eligibleMentors: number;
    mentorShare: number;
    medianSessionsPerHost: number;
  };
  library: { resources: number; coursesCovered: number; questions: number; companiesCovered: number };
  funnel: FunnelStage[];
  byTrack: Array<{ track: RoleTrack; label: string; students: number; offers: number }>;
  weeklySessions: Trend[];
  gaps: CoverageGap[];
  /** True when any breakdown was withheld for being too thin to publish. */
  suppressedAny: boolean;
  minCohort: number;
}

/** Drops any grouping thinner than the disclosure floor. */
function suppress<T extends { students: number }>(rows: T[]): { rows: T[]; suppressed: boolean } {
  const kept = rows.filter((row) => row.students >= MIN_REPORTABLE_COHORT);
  return { rows: kept, suppressed: kept.length !== rows.length };
}

function share(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export async function buildCampusReport(campus: string): Promise<CampusReport> {
  const now = new Date();
  const activeSince = new Date(now.getTime() - 30 * DAY_MS);
  const fortnight = new Date(now.getTime() + 14 * DAY_MS);
  const twelveWeeksAgo = new Date(now.getTime() - 84 * DAY_MS);

  const [
    firstYears,
    secondYears,
    total,
    active30d,
    completedSessions,
    noShows,
    openSlots,
    slotsNextFortnight,
    hostingMentors,
    eligibleMentors,
    resources,
    coursesCovered,
    questions,
    companiesCovered,
    studentsWithSessionIds,
  ] = await Promise.all([
    User.countDocuments({ campus, year: 1 }),
    User.countDocuments({ campus, year: 2 }),
    User.countDocuments({ campus }),
    User.countDocuments({ campus, lastCheckInAt: { $gte: activeSince }, suspendedAt: { $exists: false } }),
    InterviewSlot.countDocuments({ campus, status: 'completed' }),
    InterviewSlot.countDocuments({ campus, status: 'no_show' }),
    InterviewSlot.countDocuments({ campus, status: 'available', startAt: { $gte: now } }),
    InterviewSlot.countDocuments({
      campus,
      status: 'available',
      startAt: { $gte: now, $lte: fortnight },
    }),
    User.countDocuments({ campus, 'mentorProfile.acceptingBookings': true }),
    User.countDocuments({ campus, year: 2 }),
    Resource.countDocuments({ campus, hiddenAt: { $exists: false } }),
    Resource.distinct('course', { campus, hiddenAt: { $exists: false } }).then((v) => v.length),
    InterviewQuestion.countDocuments({ campus, hiddenAt: { $exists: false } }),
    InterviewQuestion.distinct('companyKey', { campus, hiddenAt: { $exists: false } }).then(
      (v) => v.length
    ),
    InterviewSlot.distinct('bookedBy', { campus, status: 'completed' }),
  ]);

  const studentsWithSession = studentsWithSessionIds.length;

  // ── Funnel ───────────────────────────────────────────────────────────────
  const stageCounts = await Application.aggregate<{ _id: ApplicationStage; count: number }>([
    { $match: { campus } },
    { $group: { _id: '$stage', count: { $sum: 1 } } },
  ]);
  const stageMap = new Map(stageCounts.map((row) => [row._id, row.count]));

  const funnel: FunnelStage[] = APPLICATION_STAGES.map((stage) => ({
    stage,
    label: stage.replace(/_/g, ' '),
    count: stageMap.get(stage) ?? 0,
  }));

  // ── By track ─────────────────────────────────────────────────────────────
  const trackRows = await Application.aggregate<{
    _id: RoleTrack;
    students: number;
    offers: number;
  }>([
    { $match: { campus } },
    {
      $group: {
        _id: '$track',
        // Distinct students, not applications — one person chasing eight
        // consulting firms is one student, and counting rows would both
        // overstate demand and defeat the disclosure floor.
        students: { $addToSet: '$user' },
        offers: { $sum: { $cond: [{ $eq: ['$stage', 'offer'] }, 1, 0] } },
      },
    },
    { $project: { students: { $size: '$students' }, offers: 1 } },
  ]);

  const { rows: keptTracks, suppressed: tracksSuppressed } = suppress(
    trackRows.map((row) => ({
      track: row._id,
      label: ROLE_TRACK_META[row._id]?.label ?? row._id,
      students: row.students,
      offers: row.offers,
    }))
  );

  // ── Weekly sessions, last twelve weeks ───────────────────────────────────
  const weekly = await InterviewSlot.aggregate<{ _id: string; count: number }>([
    { $match: { campus, status: 'completed', completedAt: { $gte: twelveWeeksAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-W%V', date: '$completedAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const weeklySessions: Trend[] = weekly.map((row) => ({ label: row._id, value: row.count }));

  // ── Median sessions per host ─────────────────────────────────────────────
  const perHost = await InterviewSlot.aggregate<{ _id: unknown; count: number }>([
    { $match: { campus, status: 'completed' } },
    { $group: { _id: '$mentor', count: { $sum: 1 } } },
    { $sort: { count: 1 } },
  ]);

  // Median, not mean: hosting is heavily skewed, and one senior who ran forty
  // sessions would otherwise read as healthy participation across the board.
  const medianSessionsPerHost =
    perHost.length === 0 ? 0 : perHost[Math.floor(perHost.length / 2)].count;

  // ── Gaps: the part a placement cell can actually act on ──────────────────
  const gaps: CoverageGap[] = [];
  const readinessShare = share(studentsWithSession, firstYears);

  if (slotsNextFortnight === 0) {
    gaps.push({
      label: 'No slots in the next fortnight',
      detail: 'Juniors have nothing bookable. Ask second-years to publish availability.',
      severity: 'high',
    });
  }
  if (readinessShare < 40 && firstYears >= MIN_REPORTABLE_COHORT) {
    gaps.push({
      label: `Only ${readinessShare}% of first-years have sat a mock`,
      detail: 'The strongest single predictor of interview performance is having done one before.',
      severity: 'high',
    });
  }
  if (share(hostingMentors, eligibleMentors) < 25 && eligibleMentors >= MIN_REPORTABLE_COHORT) {
    gaps.push({
      label: 'Senior participation is thin',
      detail: `${hostingMentors} of ${eligibleMentors} second-years are accepting bookings.`,
      severity: 'high',
    });
  }
  if (companiesCovered < 10) {
    gaps.push({
      label: 'Interview intel is sparse',
      detail: `${companiesCovered} companies covered. Prompt this season's interviewees to debrief.`,
      severity: 'medium',
    });
  }
  if (coursesCovered < 6) {
    gaps.push({
      label: 'Resource library is thin',
      detail: `${coursesCovered} courses have material. Most terms run eight to ten.`,
      severity: 'medium',
    });
  }

  return {
    campus,
    generatedAt: now.toISOString(),
    cohort: { firstYears, secondYears, total, active30d },
    readiness: {
      studentsWithSession,
      readinessShare,
      completedSessions,
      noShows,
      openSlots,
      slotsNextFortnight,
    },
    supply: {
      hostingMentors,
      eligibleMentors,
      mentorShare: share(hostingMentors, eligibleMentors),
      medianSessionsPerHost,
    },
    library: { resources, coursesCovered, questions, companiesCovered },
    funnel,
    byTrack: keptTracks,
    weeklySessions,
    gaps,
    suppressedAny: tracksSuppressed,
    minCohort: MIN_REPORTABLE_COHORT,
  };
}

/** Flattens the report into CSV — placement cells live in spreadsheets. */
export function reportToCsv(report: CampusReport): string {
  const rows: Array<[string, string, string]> = [
    ['Section', 'Metric', 'Value'],
    ['Cohort', 'First years', String(report.cohort.firstYears)],
    ['Cohort', 'Second years', String(report.cohort.secondYears)],
    ['Cohort', 'Total registered', String(report.cohort.total)],
    ['Cohort', 'Active last 30 days', String(report.cohort.active30d)],
    ['Readiness', 'First-years with a completed mock', String(report.readiness.studentsWithSession)],
    ['Readiness', 'Readiness share (%)', String(report.readiness.readinessShare)],
    ['Readiness', 'Sessions completed', String(report.readiness.completedSessions)],
    ['Readiness', 'No-shows', String(report.readiness.noShows)],
    ['Readiness', 'Slots open now', String(report.readiness.openSlots)],
    ['Readiness', 'Slots in next fortnight', String(report.readiness.slotsNextFortnight)],
    ['Supply', 'Seniors accepting bookings', String(report.supply.hostingMentors)],
    ['Supply', 'Second-years total', String(report.supply.eligibleMentors)],
    ['Supply', 'Participation share (%)', String(report.supply.mentorShare)],
    ['Supply', 'Median sessions per host', String(report.supply.medianSessionsPerHost)],
    ['Library', 'Resources shared', String(report.library.resources)],
    ['Library', 'Courses covered', String(report.library.coursesCovered)],
    ['Library', 'Interview questions logged', String(report.library.questions)],
    ['Library', 'Companies covered', String(report.library.companiesCovered)],
    ...report.funnel.map(
      (stage) => ['Pipeline', `Applications — ${stage.label}`, String(stage.count)] as [string, string, string]
    ),
    ...report.byTrack.map(
      (row) => ['By track', `${row.label} — students`, String(row.students)] as [string, string, string]
    ),
    ...report.weeklySessions.map(
      (week) => ['Weekly sessions', week.label, String(week.value)] as [string, string, string]
    ),
  ];

  // Quote every field and double any embedded quotes, so a campus name with a
  // comma cannot shift every subsequent column.
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
