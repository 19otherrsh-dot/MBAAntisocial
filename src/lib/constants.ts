/**
 * Domain vocabulary shared by the Mongoose schemas, the zod request schemas,
 * and the UI. Anything enumerable lives here exactly once so a new session type
 * or task category cannot drift between the three layers.
 */

// ───────────────────────── Roles & access ─────────────────────────

export const USER_ROLES = [
  'student',
  'mentor',
  'alumni',
  'moderator',
  /** Institute staff: reads the campus report, moderates nothing. */
  'placement_office',
  'admin',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Roles permitted to publish availability and host sessions. */
export const MENTOR_ROLES: readonly UserRole[] = ['mentor', 'alumni', 'moderator', 'admin'];

/** Roles permitted to act on reports and hide content. */
export const MODERATOR_ROLES: readonly UserRole[] = ['moderator', 'admin'];

/**
 * Roles permitted to read the aggregate campus report.
 *
 * Deliberately separate from moderation: a placement officer needs the numbers
 * but has no business hiding a student's feed post, and a student moderator
 * should not become staff by implication. Granting one must not grant the other.
 */
export const STAFF_ROLES: readonly UserRole[] = ['placement_office', 'admin'];

/**
 * Minimum cohort size before a breakdown row is published.
 *
 * Individual pipelines are private by construction, and an aggregate can leak
 * them straight back out: "one student applied to Company X and was rejected"
 * identifies that student on a small campus as surely as naming them. Any
 * grouping thinner than this is suppressed rather than rounded.
 */
export const MIN_REPORTABLE_COHORT = 5;

// ───────────────────────── Mock sessions (§6.1) ─────────────────────────

export const SESSION_TYPES = ['mock_interview', 'mock_gd', 'resume_review', 'general_qa'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_TYPE_META: Record<
  SessionType,
  { label: string; short: string; blurb: string; tone: Tone; defaultMinutes: number }
> = {
  mock_interview: {
    label: 'Mock Interview',
    short: 'PI',
    blurb: 'A full personal-interview run with a senior playing the panel.',
    tone: 'violet',
    defaultMinutes: 45,
  },
  mock_gd: {
    label: 'Mock GD',
    short: 'GD',
    blurb: 'Group discussion practice with a live moderator and scoring.',
    tone: 'blue',
    defaultMinutes: 30,
  },
  resume_review: {
    label: 'Resume Review',
    short: 'CV',
    blurb: 'Line-by-line teardown of your resume before you submit it anywhere.',
    tone: 'teal',
    defaultMinutes: 30,
  },
  general_qa: {
    label: 'General Q&A',
    short: 'QA',
    blurb: 'Open conversation — electives, roles, summers, whatever you need.',
    tone: 'amber',
    defaultMinutes: 20,
  },
};

export const SLOT_STATUSES = [
  'available',
  'booked',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

/**
 * Cancellation policy (§6.1 "reschedule/cancel flow with notice-period rules").
 * Inside the notice window a booking can still be released, but it is recorded
 * as a late cancellation against the party that pulled out.
 */
export const CANCELLATION_NOTICE_HOURS = 12;

/** How far ahead a mentor may publish availability. */
export const MAX_SLOT_LEAD_DAYS = 60;

/**
 * Concurrent open requests a junior may hold. Directly mitigates the senior
 * burnout risk in §11 — demand is capped at the source, not by seniors saying no.
 */
export const MAX_ACTIVE_BOOKINGS_PER_MENTEE = 3;

// ───────────────────────── Feedback rubrics (§6.1) ─────────────────────────

export interface RubricCriterion {
  key: string;
  label: string;
  help: string;
}

/** Filled in by the mentor about the mentee. */
export const MENTOR_RUBRIC: readonly RubricCriterion[] = [
  { key: 'preparedness', label: 'Preparedness', help: 'Knew their resume, the role, and the basics cold.' },
  { key: 'structure', label: 'Structure', help: 'Answers had a spine — not a stream of consciousness.' },
  { key: 'communication', label: 'Communication', help: 'Clear, paced, and audible without filler.' },
  { key: 'depth', label: 'Depth', help: 'Held up when pushed a layer past the first answer.' },
];

/** Filled in by the mentee about the mentor. */
export const MENTEE_RUBRIC: readonly RubricCriterion[] = [
  { key: 'usefulness', label: 'Usefulness', help: 'Left you with something you can actually act on.' },
  { key: 'candour', label: 'Candour', help: 'Told you the real problem instead of being polite.' },
  { key: 'preparedness', label: 'Preparedness', help: 'Showed up on time and had read your material.' },
];

export const RATING_MIN = 1;
export const RATING_MAX = 5;

// ───────────────────────── Tasks & comps (§6.4) ─────────────────────────

export const TASK_TYPES = ['assignment', 'case_comp', 'daily', 'exam', 'personal'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_META: Record<TaskType, { label: string; tone: Tone }> = {
  assignment: { label: 'Assignment', tone: 'blue' },
  case_comp: { label: 'Case Comp', tone: 'violet' },
  daily: { label: 'Daily', tone: 'teal' },
  exam: { label: 'Exam', tone: 'rose' },
  personal: { label: 'Personal', tone: 'amber' },
};

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'slate' },
  medium: { label: 'Medium', tone: 'amber' },
  high: { label: 'High', tone: 'rose' },
};

export const RECURRENCE_PATTERNS = ['daily', 'weekdays', 'weekly'] as const;
export type RecurrencePattern = (typeof RECURRENCE_PATTERNS)[number];

export const RECURRENCE_META: Record<RecurrencePattern, { label: string }> = {
  daily: { label: 'Every day' },
  weekdays: { label: 'Weekdays' },
  weekly: { label: 'Every week' },
};

export const COMP_CATEGORIES = [
  'consulting',
  'marketing',
  'finance',
  'operations',
  'product',
  'sustainability',
  'general',
] as const;
export type CompCategory = (typeof COMP_CATEGORIES)[number];

// ───────────────────────── Placement pipeline ─────────────────────────

/**
 * The role families a student targets. Kept separate from `COMP_CATEGORIES`
 * because a competition's theme and a job's function are not the same taxonomy —
 * a sustainability case competition is a route into a consulting role.
 */
export const ROLE_TRACKS = [
  'consulting',
  'product',
  'marketing',
  'finance',
  'operations',
  'analytics',
  'general_management',
  'hr',
] as const;
export type RoleTrack = (typeof ROLE_TRACKS)[number];

export const ROLE_TRACK_META: Record<RoleTrack, { label: string; tone: Tone }> = {
  consulting: { label: 'Consulting', tone: 'violet' },
  product: { label: 'Product', tone: 'blue' },
  marketing: { label: 'Marketing', tone: 'rose' },
  finance: { label: 'Finance', tone: 'teal' },
  operations: { label: 'Operations', tone: 'amber' },
  analytics: { label: 'Analytics', tone: 'blue' },
  general_management: { label: 'General Management', tone: 'slate' },
  hr: { label: 'HR', tone: 'rose' },
};

/** How the opportunity was reached — campus process, or the student's own effort. */
export const APPLICATION_SOURCES = ['campus', 'off_campus', 'referral'] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const APPLICATION_SOURCE_META: Record<ApplicationSource, { label: string }> = {
  campus: { label: 'Campus process' },
  off_campus: { label: 'Off campus' },
  referral: { label: 'Referral' },
};

/**
 * Pipeline stages. Ordered: the index doubles as sort position on the board, so
 * a new stage must be inserted where it actually belongs in the funnel.
 */
export const APPLICATION_STAGES = [
  'interested',
  'applied',
  'in_process',
  'offer',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const APPLICATION_STAGE_META: Record<
  ApplicationStage,
  { label: string; tone: Tone; /** Closed stages stop counting as active pursuit. */ closed: boolean }
> = {
  interested: { label: 'Interested', tone: 'slate', closed: false },
  applied: { label: 'Applied', tone: 'blue', closed: false },
  in_process: { label: 'In process', tone: 'violet', closed: false },
  offer: { label: 'Offer', tone: 'teal', closed: true },
  rejected: { label: 'Rejected', tone: 'rose', closed: true },
  withdrawn: { label: 'Withdrawn', tone: 'slate', closed: true },
};

/** The rounds an Indian B-school placement process actually runs. */
export const ROUND_TYPES = [
  'shortlist',
  'aptitude',
  'group_discussion',
  'case',
  'technical',
  'hr',
  'final',
] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

export const ROUND_TYPE_META: Record<
  RoundType,
  {
    label: string;
    tone: Tone;
    /** Which mock session type prepares for this round, if any. */
    practiceWith: SessionType | null;
  }
> = {
  shortlist: { label: 'Resume shortlist', tone: 'slate', practiceWith: 'resume_review' },
  aptitude: { label: 'Aptitude test', tone: 'blue', practiceWith: null },
  group_discussion: { label: 'Group discussion', tone: 'amber', practiceWith: 'mock_gd' },
  case: { label: 'Case interview', tone: 'violet', practiceWith: 'mock_interview' },
  technical: { label: 'Technical round', tone: 'teal', practiceWith: 'mock_interview' },
  hr: { label: 'HR round', tone: 'rose', practiceWith: 'mock_interview' },
  final: { label: 'Final round', tone: 'violet', practiceWith: 'mock_interview' },
};

export const ROUND_OUTCOMES = ['pending', 'cleared', 'rejected', 'no_result'] as const;
export type RoundOutcome = (typeof ROUND_OUTCOMES)[number];

export const ROUND_OUTCOME_META: Record<RoundOutcome, { label: string; tone: Tone }> = {
  pending: { label: 'Not yet', tone: 'slate' },
  cleared: { label: 'Cleared', tone: 'teal' },
  rejected: { label: 'Did not clear', tone: 'rose' },
  no_result: { label: 'Never heard back', tone: 'amber' },
};

/**
 * How difficult the contributor found a question. A three-point scale, because
 * a five-point one on a single subjective axis produces noise, not resolution.
 */
export const QUESTION_DIFFICULTIES = ['warmup', 'standard', 'brutal'] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const QUESTION_DIFFICULTY_META: Record<QuestionDifficulty, { label: string; tone: Tone }> = {
  warmup: { label: 'Warm-up', tone: 'teal' },
  standard: { label: 'Standard', tone: 'blue' },
  brutal: { label: 'Brutal', tone: 'rose' },
};

/**
 * How long a contributed question stays worth showing. Interview patterns drift;
 * anything older than this is still readable but flagged as dated.
 */
export const QUESTION_FRESHNESS_MONTHS = 24;

// ───────────────────────── Notes (§6.5) ─────────────────────────

/**
 * Deliberately excludes current gradable submissions. §6.5 flags raw assignment
 * sharing as an academic-integrity risk, so the schema simply has no category
 * for it rather than relying on a policy page nobody reads.
 */
export const RESOURCE_KINDS = ['class_notes', 'summary', 'past_paper', 'reading_list', 'slide_deck'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_KIND_META: Record<ResourceKind, { label: string; tone: Tone }> = {
  class_notes: { label: 'Class Notes', tone: 'blue' },
  summary: { label: 'Summary', tone: 'teal' },
  past_paper: { label: 'Past Paper', tone: 'violet' },
  reading_list: { label: 'Reading List', tone: 'amber' },
  slide_deck: { label: 'Slide Deck', tone: 'rose' },
};

export const ALLOWED_FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xlsx', 'md', 'txt'] as const;
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// ───────────────────────── Feed (§6.2) ─────────────────────────

export const POST_CATEGORIES = ['general', 'ask', 'event', 'club', 'resource', 'lost_found'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];

export const POST_CATEGORY_META: Record<PostCategory, { label: string; tone: Tone }> = {
  general: { label: 'General', tone: 'slate' },
  ask: { label: 'Ask', tone: 'violet' },
  event: { label: 'Event', tone: 'amber' },
  club: { label: 'Club', tone: 'blue' },
  resource: { label: 'Resource', tone: 'teal' },
  lost_found: { label: 'Lost & Found', tone: 'rose' },
};

/**
 * Named reactions rather than emoji. Each is a distinct signal the feed can
 * sort on, which an emoji palette cannot do.
 */
export const REACTION_KINDS = ['useful', 'agree', 'funny', 'seen_it'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REACTION_META: Record<ReactionKind, { label: string; tone: Tone }> = {
  useful: { label: 'Useful', tone: 'teal' },
  agree: { label: 'Agree', tone: 'violet' },
  funny: { label: 'Funny', tone: 'amber' },
  seen_it: { label: 'Seen it', tone: 'slate' },
};

export const MAX_POST_LENGTH = 2000;
export const MAX_COMMENT_LENGTH = 800;

// ───────────────────────── Campus opportunities ─────────────────────────

/**
 * What a campus opportunity actually is.
 *
 * Deliberately not a job board. Competing with a national marketplace on
 * external listings means competing without their employer relationships, and
 * an empty listings page is the one screen that proves how small a platform is.
 * Everything here is supply that already exists on a campus and appears on no
 * placement portal — plus alumni referrals, which are a person from your own
 * school rather than a listing anyone can scrape.
 */
export const OPPORTUNITY_KINDS = [
  'club_role',
  'teaching_assistant',
  'live_project',
  'campus_venture',
  'alumni_referral',
] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const OPPORTUNITY_KIND_META: Record<
  OpportunityKind,
  { label: string; blurb: string; tone: Tone; /** Whether an external org name applies. */ hasOrg: boolean }
> = {
  club_role: {
    label: 'Club or committee',
    blurb: 'Recruiting for a campus club, committee, or fest team.',
    tone: 'violet',
    hasOrg: false,
  },
  teaching_assistant: {
    label: 'TA or research',
    blurb: 'Teaching assistantship or research work with a professor.',
    tone: 'blue',
    hasOrg: false,
  },
  live_project: {
    label: 'Live project',
    blurb: 'A real engagement with a company, run through campus.',
    tone: 'teal',
    hasOrg: true,
  },
  campus_venture: {
    label: 'Student venture',
    blurb: 'Someone on campus building something and looking for people.',
    tone: 'amber',
    hasOrg: false,
  },
  alumni_referral: {
    label: 'Alumni referral',
    blurb: 'An alum offering to refer people into their own company.',
    tone: 'rose',
    hasOrg: true,
  },
};

export const COMMITMENT_LEVELS = ['light', 'moderate', 'heavy'] as const;
export type CommitmentLevel = (typeof COMMITMENT_LEVELS)[number];

export const COMMITMENT_META: Record<CommitmentLevel, { label: string }> = {
  light: { label: 'A few hours a week' },
  moderate: { label: 'Around a day a week' },
  heavy: { label: 'Several days a week' },
};

// ───────────────────────── Moderation ─────────────────────────

export const REPORT_REASONS = ['harassment', 'spam', 'academic_integrity', 'misinformation', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_META: Record<ReportReason, { label: string }> = {
  harassment: { label: 'Harassment or abuse' },
  spam: { label: 'Spam or self-promotion' },
  academic_integrity: { label: 'Academic integrity concern' },
  misinformation: { label: 'Misleading information' },
  other: { label: 'Something else' },
};

// ───────────────────────── Gamification (§6.3) ─────────────────────────

/**
 * Two separate ledgers, per §6.3 V2. `points` measure looking after yourself;
 * `karma` measures looking after everyone else. Keeping them apart is what
 * stops a leaderboard from rewarding pure self-interest, and it is the metric
 * seniors are actually recognised on.
 */
export type LedgerTrack = 'points' | 'karma';

export interface PointRule {
  points: number;
  track: LedgerTrack;
  label: string;
  /** Max awards per UTC day; `null` means uncapped. Blunts farming loops. */
  dailyCap: number | null;
}

export const POINT_RULES = {
  daily_check_in: { points: 5, track: 'points', label: 'Daily check-in', dailyCap: 1 },
  task_completed: { points: 8, track: 'points', label: 'Task completed', dailyCap: 10 },
  task_completed_on_time: { points: 4, track: 'points', label: 'Beat the deadline', dailyCap: 10 },
  streak_milestone: { points: 60, track: 'points', label: 'Streak milestone', dailyCap: null },
  comp_saved: { points: 3, track: 'points', label: 'Saved a competition', dailyCap: 5 },

  mock_hosted: { points: 60, track: 'karma', label: 'Hosted a session', dailyCap: 6 },
  mock_attended: { points: 25, track: 'points', label: 'Completed a session', dailyCap: 4 },
  feedback_given: { points: 20, track: 'karma', label: 'Gave structured feedback', dailyCap: 6 },
  resource_shared: { points: 30, track: 'karma', label: 'Shared a resource', dailyCap: 5 },
  resource_upvoted: { points: 5, track: 'karma', label: 'Resource found useful', dailyCap: 20 },
  answer_marked_useful: { points: 10, track: 'karma', label: 'Answer marked useful', dailyCap: 15 },
  post_created: { points: 4, track: 'points', label: 'Posted to the feed', dailyCap: 3 },

  /*
   * Contributing interview intel is the highest-karma single action in the
   * table. It is the one contribution that outlives the person making it — a
   * question logged this December is still preparing juniors two seasons from
   * now — and it is asked for at the worst possible moment, right after a round.
   * The rate has to be worth the interruption.
   */
  question_contributed: { points: 35, track: 'karma', label: 'Logged an interview question', dailyCap: 12 },
  question_upvoted: { points: 5, track: 'karma', label: 'Question found useful', dailyCap: 20 },
  round_logged: { points: 6, track: 'points', label: 'Updated your pipeline', dailyCap: 8 },
} as const satisfies Record<string, PointRule>;

export type PointAction = keyof typeof POINT_RULES;

/** Streak lengths that pay out. Milestones only — no daily guilt mechanics (§16). */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100] as const;

/**
 * A one-day grace period. Someone who misses a single day after three weeks
 * keeps their streak. This is the difference between a habit aid and a
 * punishment mechanic, and it is a deliberate choice against §16's dark patterns.
 */
export const STREAK_GRACE_DAYS = 1;

export interface BadgeDefinition {
  id: string;
  label: string;
  description: string;
  track: LedgerTrack | 'milestone';
}

export const BADGES: readonly BadgeDefinition[] = [
  { id: 'first_mock', label: 'First Contact', description: 'Completed your first mock session.', track: 'milestone' },
  { id: 'mocks_hosted_5', label: 'Open Door', description: 'Hosted five sessions for juniors.', track: 'karma' },
  { id: 'mocks_hosted_25', label: 'Institution', description: 'Hosted twenty-five sessions.', track: 'karma' },
  { id: 'archivist', label: 'Archivist', description: 'Shared ten resources with your campus.', track: 'karma' },
  { id: 'well_read', label: 'Well Read', description: 'A resource of yours passed fifty upvotes.', track: 'karma' },
  { id: 'streak_30', label: 'Thirty Days', description: 'Held a thirty-day streak.', track: 'milestone' },
  { id: 'closer', label: 'Closer', description: 'Finished a term with no overdue tasks.', track: 'points' },
  { id: 'alumni', label: 'Alumni', description: 'Graduated and giving back.', track: 'milestone' },
  { id: 'first_intel', label: 'Field Notes', description: 'Logged what a panel actually asked.', track: 'karma' },
  { id: 'intel_10', label: 'Inside Track', description: 'Contributed ten interview questions.', track: 'karma' },
  { id: 'debrief', label: 'Full Debrief', description: 'Logged intel for every round of one process.', track: 'karma' },
];

export const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

// ───────────────────────── Notifications (§7) ─────────────────────────

export const NOTIFICATION_KINDS = [
  'slot_booked',
  'slot_cancelled',
  'slot_rescheduled',
  'session_reminder',
  'feedback_requested',
  'feedback_received',
  'task_due_soon',
  'comp_deadline',
  'resource_upvoted',
  'post_reply',
  'badge_earned',
  'moderation_action',
  'round_upcoming',
  'intel_requested',
  'question_upvoted',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// ───────────────────────── Shared UI vocabulary ─────────────────────────

/** Semantic colour slots. Components accept a tone, never a raw hex. */
export type Tone = 'violet' | 'blue' | 'teal' | 'amber' | 'rose' | 'slate';

// ───────────────────────── Campus directory ─────────────────────────

export const CAMPUSES = [
  'IIM Ahmedabad',
  'IIM Bangalore',
  'IIM Calcutta',
  'IIM Lucknow',
  'IIM Kozhikode',
  'IIM Indore',
  'XLRI Jamshedpur',
  'FMS Delhi',
  'ISB Hyderabad',
  'MDI Gurgaon',
  'SPJIMR Mumbai',
  'JBIMS Mumbai',
  'IIFT Delhi',
  'NMIMS Mumbai',
  'SIBM Pune',
  'SCMHRD Pune',
  'IMT Ghaziabad',
  'Great Lakes Chennai',
  'Other',
] as const;

/** Rolling two-year batch labels, e.g. "2025-27". */
export function getBatchOptions(now: Date = new Date()): string[] {
  const year = now.getFullYear();
  const shortYear = (y: number) => String(y).slice(-2);
  return [year - 1, year, year + 1].map((start) => `${start}-${shortYear(start + 2)}`);
}

export const TERMS = ['Term I', 'Term II', 'Term III', 'Term IV', 'Term V', 'Term VI'] as const;
