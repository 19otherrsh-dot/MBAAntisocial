/**
 * Campus identity rules.
 *
 * Membership is proven by an official institute email address, and nothing
 * else. That single rule is what keeps a batch a batch: an SSO login, a
 * LinkedIn account, or a magic code all resolve to an email, and the email's
 * domain decides which campus — if any — the person belongs to.
 */

/** Consumer mailbox providers. Never accepted, whatever else is configured. */
export const PERSONAL_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'zohomail.in',
  'rediffmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'tutanota.com',
  'hey.com',
  'fastmail.com',
]);

/**
 * Suffixes that identify an academic institution. Used only to decide whether
 * an unknown domain may *request* a campus — it never grants membership on its
 * own. A domain still has to be approved before anyone on it reaches a
 * campus-scoped surface.
 */
export const ACADEMIC_SUFFIXES = [
  '.ac.in',
  '.edu.in',
  '.edu',
  '.ac.uk',
  '.edu.au',
  '.edu.sg',
  '.ac.ae',
  '.edu.ae',
  '.ac.jp',
  '.edu.cn',
  '.ac.nz',
  '.ca',
  '.res.in',
] as const;

/**
 * Indian B-schools that run on their own `.in`/`.org` domains rather than an
 * academic suffix. Listed explicitly so they can self-request a campus too.
 */
export const KNOWN_INSTITUTE_DOMAINS: ReadonlySet<string> = new Set([
  'isb.edu',
  'spjimr.org',
  'xlri.ac.in',
  'nmims.edu',
  'mdi.ac.in',
  'imt.edu',
  'greatlakes.edu.in',
  'sibm.edu.in',
  'scmhrd.edu',
  'iift.edu',
  'fms.edu',
  'jbims.edu',
  'tapmi.edu.in',
  'kjsom.somaiya.edu',
  'welingkar.org',
]);

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The domain part of an address, lower-cased, or '' when there is none. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

export function normaliseDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
}

/**
 * Whether `domain` is `allowed` or one of its subdomains. Subdomains count so
 * that `alumni.iima.ac.in` and `pgp.iima.ac.in` both resolve to IIM-A.
 * The boundary is a dot, so `fakeiima.ac.in` does not match `iima.ac.in`.
 */
export function domainMatches(domain: string, allowed: string): boolean {
  const d = normaliseDomain(domain);
  const a = normaliseDomain(allowed);
  if (!d || !a) return false;
  return d === a || d.endsWith(`.${a}`);
}

export function isPersonalEmailDomain(domain: string): boolean {
  const d = normaliseDomain(domain);
  if (PERSONAL_EMAIL_DOMAINS.has(d)) return true;
  // Regional variants: yahoo.co.uk, hotmail.fr, outlook.in, ...
  return /^(yahoo|hotmail|outlook|live|gmail)\.[a-z.]+$/.test(d);
}

/** Whether an unknown domain plausibly belongs to an institute. */
export function looksAcademic(domain: string): boolean {
  const d = normaliseDomain(domain);
  if (!d || isPersonalEmailDomain(d)) return false;
  if ([...KNOWN_INSTITUTE_DOMAINS].some((known) => domainMatches(d, known))) return true;
  return ACADEMIC_SUFFIXES.some((suffix) => d.endsWith(suffix));
}

/**
 * Lifecycle of a campus on the platform.
 *
 * - `requested`: someone with an academic-looking address asked for it. Members
 *   get the Open Edition only; nothing campus-scoped is visible.
 * - `open`: approved and verified, below the density threshold. Open Edition
 *   plus a waitlist view that shows how close the campus is to unlocking.
 * - `campus`: Campus Edition unlocked — mocks with seniors, notes, the feed.
 * - `suspended`: an admin froze it. Members can sign in and export, nothing else.
 */
export const CAMPUS_STATUSES = ['requested', 'open', 'campus', 'suspended'] as const;
export type CampusStatus = (typeof CAMPUS_STATUSES)[number];

/**
 * Members a campus needs before the Campus Edition switches on by itself
 * (PRD §15: "unlocks progressively per school as it crosses a minimum-density
 * threshold"). An admin can unlock earlier for a founding partner school.
 */
export const CAMPUS_UNLOCK_MEMBERS = 40;
/** And of those, how many must be seniors or alumni willing to mentor. */
export const CAMPUS_UNLOCK_MENTORS = 5;

export interface DensitySnapshot {
  members: number;
  mentors: number;
}

export function densityProgress({ members, mentors }: DensitySnapshot) {
  const memberPct = Math.min(1, members / CAMPUS_UNLOCK_MEMBERS);
  const mentorPct = Math.min(1, mentors / CAMPUS_UNLOCK_MENTORS);
  return {
    memberPct,
    mentorPct,
    /** The slower of the two gates is the honest measure of progress. */
    overall: Math.min(memberPct, mentorPct),
    ready: members >= CAMPUS_UNLOCK_MEMBERS && mentors >= CAMPUS_UNLOCK_MENTORS,
  };
}

/** Which edition a campus status grants. */
export function editionFor(status: CampusStatus): 'open' | 'campus' | 'none' {
  if (status === 'campus') return 'campus';
  if (status === 'suspended') return 'none';
  return 'open';
}

/**
 * Surfaces of the product and the edition each one needs. The Open Edition is
 * useful to one person on day one; the Campus Edition needs a batch.
 */
export const FEATURE_EDITION = {
  today: 'open',
  news: 'open',
  quiz: 'open',
  jargon: 'open',
  opportunities: 'open',
  comps: 'open',
  tasks: 'open',
  timetable: 'open',
  attendance: 'open',
  cgpa: 'open',
  budget: 'open',
  wellness: 'open',
  ai_interview: 'open',
  resume: 'open',
  pipeline: 'open',
  games: 'open',
  cross_campus_mentors: 'open',
  sessions: 'campus',
  intel: 'campus',
  resources: 'campus',
  feed: 'campus',
  hub: 'campus',
  events: 'campus',
  clubs: 'campus',
  marketplace: 'campus',
  travel: 'campus',
  mess: 'campus',
  whispers: 'campus',
  offers: 'campus',
  opportunities_campus: 'campus',
  leaderboard: 'campus',
  teams: 'campus',
  alumni: 'campus',
  wiki: 'campus',
} as const;

export type FeatureKey = keyof typeof FEATURE_EDITION;

export function featureAvailable(feature: FeatureKey, edition: 'open' | 'campus' | 'none'): boolean {
  if (edition === 'none') return false;
  const needs = FEATURE_EDITION[feature];
  return needs === 'open' || edition === 'campus';
}

/** URL-safe slug for a campus name: "IIM Ahmedabad" → "iim-ahmedabad". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
