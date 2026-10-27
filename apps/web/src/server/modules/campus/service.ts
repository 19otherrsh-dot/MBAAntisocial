import {
  densityProgress,
  domainMatches,
  editionFor,
  emailDomain,
  isPersonalEmailDomain,
  looksAcademic,
  normaliseDomain,
  slugify,
  type CampusStatus,
} from '@mba/shared/campus';
import { MENTOR_ROLES } from '@/lib/constants';
import { isEmailDomainAllowed } from '@/lib/env';
import Campus, { type ICampus } from '@/models/Campus';
import User from '@/models/User';
import { container } from '../../container';
import { CAMPUS_DIRECTORY } from './directory';

/**
 * The campus registry: which institute an email belongs to, which edition a
 * campus has unlocked, and the request → approve → unlock lifecycle.
 */

export type EmailResolution =
  | { kind: 'member'; campus: Pick<ICampus, 'name' | 'slug' | 'status' | 'shortName'> }
  | { kind: 'requestable'; domain: string; suggestedName: string }
  | { kind: 'blocked'; reason: string };

/** `a.b.iima.ac.in` → [a.b.iima.ac.in, b.iima.ac.in, iima.ac.in, ac.in]. */
function candidateDomains(domain: string): string[] {
  const labels = normaliseDomain(domain).split('.');
  const out: string[] = [];
  for (let i = 0; i < labels.length - 1; i += 1) out.push(labels.slice(i).join('.'));
  return out;
}

export async function findCampusByDomain(domain: string) {
  const candidates = candidateDomains(domain);
  if (candidates.length === 0) return null;
  const matches = await Campus.find({ domains: { $in: candidates } }).lean();
  // Longest (most specific) matching domain wins.
  let best: (typeof matches)[number] | null = null;
  let bestLen = 0;
  for (const campus of matches) {
    for (const d of campus.domains) {
      if (domainMatches(domain, d) && d.length > bestLen) {
        best = campus;
        bestLen = d.length;
      }
    }
  }
  return best;
}

/**
 * The single membership rule. Personal mailboxes are never accepted; a known
 * campus domain grants membership; an academic-looking unknown domain may
 * request a campus; anything else is refused.
 */
export async function resolveEmail(email: string): Promise<EmailResolution> {
  const domain = emailDomain(email);
  if (!domain) return { kind: 'blocked', reason: 'Enter a valid email address.' };
  if (isPersonalEmailDomain(domain)) {
    return {
      kind: 'blocked',
      reason: 'Use your official institute email. Personal addresses (Gmail, Outlook, Yahoo…) are not accepted.',
    };
  }
  if (!isEmailDomainAllowed(email)) {
    return { kind: 'blocked', reason: 'This deployment is limited to a pilot list of institutes.' };
  }

  const campus = await findCampusByDomain(domain);
  if (campus) {
    if (campus.status === 'suspended') {
      return { kind: 'blocked', reason: `${campus.name} is paused on MBAAntisocial. Contact your campus admin.` };
    }
    return { kind: 'member', campus: { name: campus.name, slug: campus.slug, status: campus.status, shortName: campus.shortName } };
  }

  if (looksAcademic(domain)) {
    return { kind: 'requestable', domain, suggestedName: suggestNameFromDomain(domain) };
  }
  return {
    kind: 'blocked',
    reason: 'That domain is not a recognised institute. Use your official college email, or ask us to add your institute.',
  };
}

function suggestNameFromDomain(domain: string): string {
  const head = normaliseDomain(domain).split('.')[0] ?? domain;
  return head.toUpperCase();
}

/**
 * Creates a `requested` campus for an unknown academic domain. Its members get
 * the Open Edition straight away; nothing campus-scoped switches on until an
 * admin approves the domain.
 */
export async function requestCampus(input: { name: string; domain: string; requestedBy?: string; note?: string }) {
  const domain = normaliseDomain(input.domain);
  const existing = await findCampusByDomain(domain);
  if (existing) return existing;

  const baseSlug = slugify(input.name) || slugify(domain);
  let slug = baseSlug;
  for (let n = 2; await Campus.exists({ slug }); n += 1) slug = `${baseSlug}-${n}`;

  let name = input.name.trim();
  if (await Campus.exists({ name })) name = `${name} (${domain})`;

  const campus = await Campus.create({
    name,
    slug,
    shortName: input.name.trim().slice(0, 24),
    domains: [domain],
    status: 'requested',
    requestedBy: input.requestedBy,
    requestNote: input.note ?? '',
  });

  // Tell platform admins there is a domain to review.
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  const { notifyMany } = await import('@/lib/notifications');
  await notifyMany(
    admins.map((a) => ({
      user: a._id,
      kind: 'campus_request' as const,
      title: `New institute requested: ${name}`,
      body: `Domain ${domain} is waiting for review.`,
      href: '/admin/campuses',
    }))
  );

  return campus.toObject();
}

/* ───────────────────────── Edition lookup (cached) ───────────────────────── */

const EDITION_TTL_SECONDS = 60;

export interface CampusEdition {
  status: CampusStatus;
  edition: 'open' | 'campus' | 'none';
  slug: string;
}

/**
 * Status and edition for a campus name, cached briefly because every
 * authenticated request needs it.
 */
export async function campusEdition(name: string): Promise<CampusEdition> {
  const { kv } = container();
  const cacheKey = `campus-edition:${name}`;
  const cached = await kv.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached) as CampusEdition;

  const campus = await Campus.findOne({ name }).select('status slug').lean();
  // A user whose campus string predates the registry keeps working on the Open Edition.
  const status: CampusStatus = campus?.status ?? 'open';
  const value: CampusEdition = { status, edition: editionFor(status), slug: campus?.slug ?? slugify(name) };
  await kv.set(cacheKey, JSON.stringify(value), EDITION_TTL_SECONDS).catch(() => undefined);
  return value;
}

export async function invalidateCampusEdition(name: string) {
  await container().kv.del(`campus-edition:${name}`).catch(() => undefined);
}

/* ───────────────────────── Density & unlock ───────────────────────── */

export async function campusDensity(name: string) {
  const [members, mentors] = await Promise.all([
    User.countDocuments({ campus: name, emailVerifiedAt: { $exists: true }, suspendedAt: { $exists: false } }),
    User.countDocuments({
      campus: name,
      emailVerifiedAt: { $exists: true },
      role: { $in: MENTOR_ROLES },
      suspendedAt: { $exists: false },
    }),
  ]);
  return { members, mentors, ...densityProgress({ members, mentors }) };
}

/**
 * Unlocks the Campus Edition once an approved campus crosses the density
 * threshold. Called after every verified sign-up; cheap when nothing changes.
 */
export async function maybeUnlockCampus(name: string): Promise<boolean> {
  const campus = await Campus.findOne({ name }).select('status').lean();
  if (!campus || campus.status !== 'open') return false;

  const density = await campusDensity(name);
  if (!density.ready) return false;

  const updated = await Campus.updateOne({ name, status: 'open' }, { $set: { status: 'campus', unlockedAt: new Date() } });
  if (updated.modifiedCount === 0) return false;
  await invalidateCampusEdition(name);
  await announceUnlock(name);
  return true;
}

/** Tells every member their campus just got the Campus Edition. */
export async function announceUnlock(name: string) {
  const members = await User.find({ campus: name }).select('_id').lean();
  const { notifyMany } = await import('@/lib/notifications');
  await notifyMany(
    members.map((m) => ({
      user: m._id,
      kind: 'campus_unlocked' as const,
      title: `${name} just unlocked the Campus Edition`,
      body: 'Mock sessions with seniors, your batch’s notes, the campus feed and hub are live.',
      href: '/home',
    }))
  );
  return true;
}

/** Inserts the starter directory once; existing rows are left alone. */
export async function ensureCampusDirectory() {
  const count = await Campus.estimatedDocumentCount();
  if (count > 0) return;
  await Campus.insertMany(
    CAMPUS_DIRECTORY.map((entry) => ({
      ...entry,
      slug: slugify(entry.name),
      approvedAt: new Date(),
    })),
    { ordered: false }
  ).catch(() => undefined);
}
