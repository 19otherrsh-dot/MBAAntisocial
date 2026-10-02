import { z } from 'zod';
import {
  SESSION_TYPES,
  TASK_TYPES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  RECURRENCE_PATTERNS,
  RESOURCE_KINDS,
  POST_CATEGORIES,
  COMP_CATEGORIES,
  ROLE_TRACKS,
  APPLICATION_SOURCES,
  APPLICATION_STAGES,
  ROUND_TYPES,
  ROUND_OUTCOMES,
  QUESTION_DIFFICULTIES,
  OPPORTUNITY_KINDS,
  COMMITMENT_LEVELS,
  REACTION_KINDS,
  REPORT_REASONS,
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_POST_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_SLOT_LEAD_DAYS,
  RATING_MIN,
  RATING_MAX,
  CAMPUSES,
  MENTOR_RUBRIC,
  MENTEE_RUBRIC,
} from './constants';

/** Request-body schemas. Every mutating route parses through one of these. */

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'That does not look like a valid id.');

const isoDate = z.coerce.date();

const trimmed = (max: number) => z.string().trim().max(max);
const requiredText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} needs at least ${min} character${min === 1 ? '' : 's'}.`)
    .max(max, `${label} cannot exceed ${max} characters.`);

const httpsUrl = z
  .string()
  .trim()
  .url('Enter a full URL including https://')
  .refine((value) => value.startsWith('https://'), 'Links must use https.');

// ───────────────────────── Auth ─────────────────────────

/**
 * Password floor is 10 characters with no composition rules. Length is what
 * actually resists guessing; character-class rules mostly produce `Passw0rd!`.
 */
export const registerSchema = z.object({
  name: requiredText(2, 80, 'Name'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters — length beats punctuation.')
    .max(200, 'That password is too long.'),
  // A custom message, because zod's default enumerates all nineteen campuses.
  campus: z.enum(CAMPUSES, { message: 'Pick your institute from the list.' }),
  batch: requiredText(4, 20, 'Batch'),
  year: z.coerce.number().int().refine((v) => v === 1 || v === 2, 'Pick year 1 or 2.'),
  isAlumni: z.boolean().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// ───────────────────────── Profile ─────────────────────────

export const updateProfileSchema = z.object({
  name: requiredText(2, 80, 'Name').optional(),
  image: httpsUrl.optional(),
  bio: trimmed(500).optional(),
  specializations: z.array(trimmed(40)).max(8, 'Pick at most eight.').optional(),
  leaderboardOptIn: z.boolean().optional(),
  notificationPrefs: z
    .object({
      sessionReminders: z.boolean(),
      deadlineReminders: z.boolean(),
      feedComments: z.boolean(),
      digest: z.boolean(),
    })
    .partial()
    .optional(),
  mentorProfile: z
    .object({
      acceptingBookings: z.boolean(),
      offers: z.array(z.enum(SESSION_TYPES)).max(SESSION_TYPES.length),
      weeklyCapacity: z.coerce.number().int().min(0).max(20),
      headline: trimmed(160),
      companies: z.array(trimmed(60)).max(6),
    })
    .partial()
    .optional(),
});

export const acceptHonorCodeSchema = z.object({ accepted: z.literal(true) });

// ───────────────────────── Mock sessions ─────────────────────────

const futureWindow = (date: Date) => {
  const now = Date.now();
  const max = now + MAX_SLOT_LEAD_DAYS * 86_400_000;
  return date.getTime() > now && date.getTime() <= max;
};

export const createSlotSchema = z
  .object({
    startAt: isoDate.refine(futureWindow, `Pick a time in the future, within ${MAX_SLOT_LEAD_DAYS} days.`),
    endAt: isoDate,
    sessionType: z.enum(SESSION_TYPES),
    notes: trimmed(500).default(''),
    meetingLink: z.union([httpsUrl, z.literal('')]).default(''),
  })
  .refine((v) => v.endAt > v.startAt, { message: 'The slot must end after it starts.', path: ['endAt'] })
  .refine((v) => v.endAt.getTime() - v.startAt.getTime() <= 4 * 3_600_000, {
    message: 'Keep a slot under four hours.',
    path: ['endAt'],
  });

/** Actions on an existing slot, dispatched by `PATCH /api/sessions/[id]`. */
export const slotActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('book'), bookingNote: trimmed(500).default('') }),
  z.object({ action: z.literal('cancel'), reason: trimmed(500).default('') }),
  z.object({
    action: z.literal('reschedule'),
    startAt: isoDate.refine(futureWindow, 'Pick a time in the future.'),
    endAt: isoDate,
  }),
  z.object({ action: z.literal('complete'), noShow: z.boolean().default(false) }),
]);

/**
 * One feedback schema for both directions. Which rubric applies is decided by
 * the caller's role on the slot, resolved server-side — never sent by the client.
 */
export const feedbackSchema = z.object({
  scores: z.record(z.string(), z.coerce.number().int().min(RATING_MIN).max(RATING_MAX)),
  comments: requiredText(10, 2000, 'Feedback'),
});

export const MENTOR_RUBRIC_KEYS = MENTOR_RUBRIC.map((c) => c.key);
export const MENTEE_RUBRIC_KEYS = MENTEE_RUBRIC.map((c) => c.key);

/** Ensures every criterion for the applicable rubric was answered. */
export function assertCompleteRubric(
  scores: Record<string, number>,
  keys: string[]
): void {
  const missing = keys.filter((key) => typeof scores[key] !== 'number');
  if (missing.length > 0) {
    throw new Error(`Rate every criterion — missing: ${missing.join(', ')}.`);
  }
}

export const slotQuerySchema = z.object({
  view: z.enum(['open', 'bookings', 'hosting']).default('open'),
  sessionType: z.enum(SESSION_TYPES).optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ───────────────────────── Tasks ─────────────────────────

export const createTaskSchema = z.object({
  title: requiredText(1, 200, 'Title'),
  description: trimmed(2000).default(''),
  course: trimmed(100).default(''),
  type: z.enum(TASK_TYPES).default('personal'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  dueAt: isoDate.optional().nullable(),
  recurrence: z.enum(RECURRENCE_PATTERNS).optional().nullable(),
  caseComp: objectId.optional(),
});

export const updateTaskSchema = z.object({
  taskId: objectId,
  title: requiredText(1, 200, 'Title').optional(),
  description: trimmed(2000).optional(),
  course: trimmed(100).optional(),
  type: z.enum(TASK_TYPES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueAt: isoDate.optional().nullable(),
  status: z.enum(TASK_STATUSES).optional(),
});

export const taskQuerySchema = z.object({
  type: z.enum(TASK_TYPES).optional(),
  includeCompleted: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

// ───────────────────────── Resources ─────────────────────────

const fileExtension = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (v) => (ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(v),
    `Supported formats: ${ALLOWED_FILE_EXTENSIONS.join(', ')}.`
  );

export const createResourceSchema = z.object({
  title: requiredText(3, 200, 'Title'),
  description: trimmed(1000).default(''),
  course: requiredText(2, 100, 'Course'),
  professor: trimmed(100).default(''),
  term: requiredText(2, 40, 'Term'),
  kind: z.enum(RESOURCE_KINDS).default('class_notes'),
  fileUrl: httpsUrl,
  fileName: requiredText(1, 260, 'File name'),
  fileType: fileExtension,
  fileSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_FILE_SIZE_BYTES, `Keep files under ${Math.round(MAX_FILE_SIZE_BYTES / 1_048_576)} MB.`),
  tags: z.array(trimmed(30)).max(8, 'Eight tags is plenty.').default([]),
  /**
   * §6.5 — the uploader affirms this is shareable material and not someone
   * else's gradable work. Rejected at the schema level rather than assumed.
   */
  honorCodeAffirmed: z.literal(true, {
    message: 'Confirm the sharing policy before uploading.',
  }),
});

export const resourceActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upvote'), resourceId: objectId }),
  z.object({ action: z.literal('download'), resourceId: objectId }),
  z.object({
    action: z.literal('new_version'),
    resourceId: objectId,
    fileUrl: httpsUrl,
    fileName: requiredText(1, 260, 'File name'),
    fileType: fileExtension,
    fileSize: z.coerce.number().int().min(1).max(MAX_FILE_SIZE_BYTES),
    note: trimmed(300).default(''),
  }),
]);

export const resourceQuerySchema = z.object({
  search: trimmed(120).optional(),
  course: trimmed(100).optional(),
  kind: z.enum(RESOURCE_KINDS).optional(),
  sort: z.enum(['newest', 'upvotes', 'downloads']).default('newest'),
  page: z.coerce.number().int().min(1).max(200).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(18),
});

// ───────────────────────── Feed ─────────────────────────

export const createPostSchema = z.object({
  content: requiredText(1, MAX_POST_LENGTH, 'Post'),
  category: z.enum(POST_CATEGORIES).default('general'),
  links: z.array(httpsUrl).max(3, 'Three links maximum.').default([]),
});

export const postActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('react'), postId: objectId, reaction: z.enum(REACTION_KINDS) }),
  z.object({
    action: z.literal('comment'),
    postId: objectId,
    content: requiredText(1, MAX_COMMENT_LENGTH, 'Comment'),
  }),
  z.object({ action: z.literal('mark_useful'), postId: objectId, commentId: objectId }),
  z.object({ action: z.literal('resolve'), postId: objectId }),
  z.object({ action: z.literal('delete'), postId: objectId }),
]);

export const feedQuerySchema = z.object({
  category: z.union([z.enum(POST_CATEGORIES), z.literal('all')]).default('all'),
  scope: z.enum(['campus', 'global']).default('campus'),
  page: z.coerce.number().int().min(1).max(200).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ───────────────────────── Competitions ─────────────────────────

export const compQuerySchema = z.object({
  category: z.union([z.enum(COMP_CATEGORIES), z.literal('all')]).default('all'),
  saved: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  includePast: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const compActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), compId: objectId }),
  z.object({ action: z.literal('unsave'), compId: objectId }),
  z.object({ action: z.literal('track'), compId: objectId }),
]);

// ───────────────────────── Placement pipeline ─────────────────────────

export const createApplicationSchema = z.object({
  company: requiredText(2, 120, 'Company'),
  role: requiredText(2, 120, 'Role'),
  track: z.enum(ROLE_TRACKS).default('general_management'),
  source: z.enum(APPLICATION_SOURCES).default('campus'),
  stage: z.enum(APPLICATION_STAGES).default('interested'),
  notes: trimmed(2000).default(''),
});

export const updateApplicationSchema = z.object({
  company: requiredText(2, 120, 'Company').optional(),
  role: requiredText(2, 120, 'Role').optional(),
  track: z.enum(ROLE_TRACKS).optional(),
  source: z.enum(APPLICATION_SOURCES).optional(),
  stage: z.enum(APPLICATION_STAGES).optional(),
  notes: trimmed(2000).optional(),
});

export const applicationQuerySchema = z.object({
  stage: z.union([z.enum(APPLICATION_STAGES), z.literal('all'), z.literal('open')]).default('open'),
  track: z.enum(ROLE_TRACKS).optional(),
});

/** Actions on the rounds inside one application. */
export const roundActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add'),
    type: z.enum(ROUND_TYPES),
    label: trimmed(80).default(''),
    scheduledAt: isoDate.optional().nullable(),
  }),
  z.object({
    action: z.literal('update'),
    roundId: objectId,
    label: trimmed(80).optional(),
    scheduledAt: isoDate.optional().nullable(),
    outcome: z.enum(ROUND_OUTCOMES).optional(),
    notes: trimmed(2000).optional(),
  }),
  z.object({ action: z.literal('remove'), roundId: objectId }),
  /** Marks the intel prompt as answered or declined, so it is not shown again. */
  z.object({ action: z.literal('dismiss_intel'), roundId: objectId }),
]);

// ───────────────────────── Interview intel ─────────────────────────

export const createQuestionSchema = z.object({
  company: requiredText(2, 120, 'Company'),
  role: trimmed(120).default(''),
  track: z.enum(ROLE_TRACKS).default('general_management'),
  roundType: z.enum(ROUND_TYPES),
  question: requiredText(8, 1000, 'The question'),
  guidance: trimmed(2000).default(''),
  difficulty: z.enum(QUESTION_DIFFICULTIES).default('standard'),
  tags: z.array(trimmed(30)).max(6, 'Six tags is plenty.').default([]),
  askedAt: isoDate.refine(
    (date) => date.getTime() <= Date.now() + 86_400_000,
    'You cannot log a question from the future.'
  ),
  anonymous: z.boolean().default(false),
  /** Present when logged from a tracked round, which is what marks it verified. */
  applicationId: objectId.optional(),
  roundId: objectId.optional(),
});

export const questionQuerySchema = z.object({
  search: trimmed(120).optional(),
  company: trimmed(120).optional(),
  track: z.enum(ROLE_TRACKS).optional(),
  roundType: z.enum(ROUND_TYPES).optional(),
  sort: z.enum(['recent', 'useful']).default('recent'),
  page: z.coerce.number().int().min(1).max(200).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const questionActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('upvote'), questionId: objectId }),
  z.object({ action: z.literal('delete'), questionId: objectId }),
]);

// ───────────────────────── Moderation ─────────────────────────

export const createReportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'resource', 'user', 'whisper']),
  target: objectId,
  parent: objectId.optional(),
  reason: z.enum(REPORT_REASONS),
  detail: trimmed(1000).default(''),
});

export const resolveReportSchema = z.object({
  reportId: objectId,
  resolution: z.enum(['hide_content', 'dismiss']),
  note: trimmed(1000).default(''),
});

// ───────────────────────── Notifications ─────────────────────────

export const notificationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_read'), notificationId: objectId }),
  z.object({ action: z.literal('mark_all_read') }),
]);

// ───────────────────────── Jobs & Referrals ─────────────────────────

export const createJobSchema = z.object({
  title: requiredText(3, 120, 'Title'),
  kind: z.enum(OPPORTUNITY_KINDS).default('club_role'),
  // Only some kinds have an external organisation behind them, so this is
  // optional rather than a required field people invent an answer for.
  org: trimmed(80).default(''),
  description: requiredText(10, 2000, 'Description'),
  commitment: z.enum(COMMITMENT_LEVELS).default('moderate'),
  link: z.union([httpsUrl, z.literal('')]).default(''),
  invitesContact: z.boolean().default(true),
  closesAt: isoDate.optional().nullable(),
});

export const jobQuerySchema = z.object({
  kind: z.union([z.enum(OPPORTUNITY_KINDS), z.literal('all')]).default('all'),
  page: z.coerce.number().int().min(1).max(200).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ───────────────────────── Study Rooms ─────────────────────────

export const createRoomSchema = z.object({
  title: requiredText(3, 100, 'Title'),
  topic: requiredText(2, 50, 'Topic'),
  isGlobal: z.boolean().default(false),
  durationHours: z.coerce.number().int().min(1).max(24).default(12),
});

export const roomMessageSchema = z.object({
  content: requiredText(1, 2000, 'Message'),
});

// ───────────────────────── Offers (Anonymous Salary Intel) ─────────────────────────

export const createOfferSchema = z.object({
  company: requiredText(2, 100, 'Company'),
  role: requiredText(2, 100, 'Role'),
  location: requiredText(2, 100, 'Location'),
  baseSalary: z.coerce.number().int().min(0, 'Base salary cannot be negative'),
  signingBonus: z.coerce.number().int().min(0).default(0),
  offerType: z.enum(['internship', 'full_time']),
  track: z.enum(ROLE_TRACKS),
});

// ───────────────────────── The Black Book (Network CRM) ─────────────────────────

export const createContactSchema = z.object({
  name: requiredText(2, 100, 'Name'),
  company: requiredText(2, 100, 'Company'),
  role: requiredText(2, 100, 'Role'),
  status: z.enum(['cold', 'warm', 'advocate']).default('cold'),
  notes: trimmed(2000).default(''),
});

export const updateContactSchema = z.object({
  contactId: objectId,
  name: requiredText(2, 100, 'Name').optional(),
  company: requiredText(2, 100, 'Company').optional(),
  role: requiredText(2, 100, 'Role').optional(),
  status: z.enum(['cold', 'warm', 'advocate']).optional(),
  notes: trimmed(2000).optional(),
  bumpLastContacted: z.boolean().optional(),
});

// ───────────────────────── The Whisper Network ─────────────────────────

export const createWhisperSchema = z.object({
  targetName: requiredText(2, 100, 'Target name'),
  targetType: z.enum(['course', 'professor']),
  rating: z.coerce.number().int().min(1).max(5),
  difficulty: z.coerce.number().int().min(1).max(5),
  workload: z.coerce.number().int().min(1).max(5),
  content: requiredText(10, 2000, 'Review content'),
});

// ───────────────────────── The Syndicate (Group Buys) ─────────────────────────

export const createBountySchema = z.object({
  title: requiredText(3, 100, 'Title'),
  description: trimmed(1000).default(''),
  totalCost: z.coerce.number().int().min(1, 'Cost must be positive'),
  slotsRequired: z.coerce.number().int().min(2, 'Need at least 2 people to split'),
  category: z.enum(['subscription', 'travel', 'event', 'other']).default('other'),
});

export const claimBountySchema = z.object({
  bountyId: objectId,
});

export { objectId };
