import type { Types } from 'mongoose';
import { MIN_REPORTABLE_COHORT, MENTOR_ROLES } from '@/lib/constants';
import User from '@/models/User';
import InterviewSlot from '@/models/InterviewSlot';
import Post from '@/models/Post';
import Resource from '@/models/Resource';
import Course from '@/models/academics/Course';
import HubMessage from '@/models/hub/HubMessage';
import HubServer from '@/models/hub/HubServer';
import { DAY_MS } from '@/lib/time';
import { container } from '@/server/container';

/**
 * The success metrics of PRD §9, computed for one campus or the whole
 * platform. Each comes with its numerator and denominator so a reader can
 * judge it, and is withheld when the group is too small to be anonymous.
 */

export interface Ratio {
  value: number | null;
  numerator: number;
  denominator: number;
  /** True when the denominator is under the privacy floor and the value is withheld. */
  suppressed: boolean;
}

export interface SuccessMetrics {
  windowDays: number;
  /** % of first-years who completed at least one mock in the window. */
  mockReach: Ratio;
  /** Unique mentors who hosted a completed session / seniors and alumni. */
  seniorParticipation: Ratio;
  /** Unique people who posted or commented in the feed in the last 7 days / members. */
  feedWeeklyActive: Ratio;
  /** Unique people who wrote in the hub in the last 7 days / members. */
  hubWeeklyActive: Ratio;
  /** Courses students track that have at least one shared note set / courses tracked. */
  notesCoverage: Ratio;
  /** Members (here a week or more) who have ever held a 7-day streak. */
  streak7: Ratio;
  /** Members (here a month or more) who have ever held a 30-day streak. */
  streak30: Ratio;
}

export function ratio(numerator: number, denominator: number): Ratio {
  const suppressed = denominator < MIN_REPORTABLE_COHORT;
  return {
    value: suppressed || denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 10,
    numerator: suppressed ? 0 : numerator,
    denominator,
    suppressed,
  };
}

/** Course identity across students' personal lists: the code when present, else the name. */
export function courseKey(course: { code?: string; name: string }): string {
  return (course.code?.trim() || course.name.trim()).toLowerCase().replace(/[\s._-]+/g, '');
}

const member = { emailVerifiedAt: { $exists: true }, suspendedAt: { $exists: false } };

export async function successMetrics(campus: string | null, windowDays = 120, now = new Date()): Promise<SuccessMetrics> {
  const scope = campus ? { campus } : {};
  const since = new Date(now.getTime() - windowDays * DAY_MS);
  const week = new Date(now.getTime() - 7 * DAY_MS);

  const userIds = async (filter: Record<string, unknown>) =>
    new Set((await User.find({ ...scope, ...member, ...filter }).select('_id').lean()).map((u) => String(u._id)));

  const [firstYears, seniors, members, mockTakers, hosts, feedAuthors, commentAuthors, hubServers] = await Promise.all([
    userIds({ year: 1, role: 'student' }),
    userIds({ $or: [{ year: 2 }, { role: 'alumni' }], role: { $in: ['student', ...MENTOR_ROLES] } }),
    User.countDocuments({ ...scope, ...member }),
    InterviewSlot.distinct('bookedBy', { ...scope, status: 'completed', startAt: { $gte: since } }),
    InterviewSlot.distinct('mentor', { ...scope, status: 'completed', startAt: { $gte: since } }),
    Post.distinct('author', { ...scope, createdAt: { $gte: week }, hiddenAt: { $exists: false } }),
    Post.distinct('comments.author', { ...scope, 'comments.createdAt': { $gte: week } }),
    campus ? HubServer.find({ campus }).select('_id').lean() : Promise.resolve(null),
  ]);

  const hubFilter: Record<string, unknown> = { createdAt: { $gte: week }, author: { $exists: true } };
  if (hubServers) hubFilter.server = { $in: hubServers.map((s) => s._id) };
  const hubAuthors = await HubMessage.distinct('author', hubFilter);

  const count = (ids: Array<Types.ObjectId | string | null | undefined>, within: Set<string>) =>
    new Set(ids.filter(Boolean).map(String).filter((id) => within.has(id))).size;
  const allMembers = await userIds({});

  // Notes coverage: the campus's course list is the union of what students track.
  const [courses, resourceCourses] = await Promise.all([
    Course.find({ ...(campus ? { user: { $in: [...allMembers] } } : {}), archived: { $ne: true } }).select('code name').lean(),
    Resource.distinct('course', { ...scope, hiddenAt: { $exists: false } }),
  ]);
  const shared = new Set((resourceCourses as string[]).map((name) => courseKey({ name })));
  const tracked = new Map<string, boolean>();
  for (const course of courses) {
    const key = courseKey(course);
    // Notes may be filed under the course code or its full name.
    const hasNotes = shared.has(key) || shared.has(courseKey({ name: course.name }));
    tracked.set(key, (tracked.get(key) ?? false) || hasNotes);
  }
  const coveredCount = [...tracked.values()].filter(Boolean).length;

  const [tenured7, reached7, tenured30, reached30] = await Promise.all([
    User.countDocuments({ ...scope, ...member, createdAt: { $lte: new Date(now.getTime() - 7 * DAY_MS) } }),
    User.countDocuments({ ...scope, ...member, createdAt: { $lte: new Date(now.getTime() - 7 * DAY_MS) }, longestStreak: { $gte: 7 } }),
    User.countDocuments({ ...scope, ...member, createdAt: { $lte: new Date(now.getTime() - 30 * DAY_MS) } }),
    User.countDocuments({ ...scope, ...member, createdAt: { $lte: new Date(now.getTime() - 30 * DAY_MS) }, longestStreak: { $gte: 30 } }),
  ]);

  return {
    windowDays,
    mockReach: ratio(count(mockTakers, firstYears), firstYears.size),
    seniorParticipation: ratio(count(hosts, seniors), seniors.size),
    feedWeeklyActive: ratio(count([...feedAuthors, ...commentAuthors], allMembers), members),
    hubWeeklyActive: ratio(count(hubAuthors, allMembers), members),
    notesCoverage: ratio(coveredCount, tracked.size),
    streak7: ratio(reached7, tenured7),
    streak30: ratio(reached30, tenured30),
  };
}

const CACHE_SECONDS = 300;

/**
 * The metrics are a dozen aggregate queries; they change slowly, so readers
 * share one computation per campus and window for five minutes. `fresh`
 * recomputes on demand.
 */
export async function cachedSuccessMetrics(campus: string | null, windowDays: number, fresh = false): Promise<{ metrics: SuccessMetrics; computedAt: string }> {
  const { kv } = container();
  const key = `metrics:${campus ?? '*'}:${windowDays}`;
  if (!fresh) {
    const hit = await kv.get(key).catch(() => null);
    if (hit) return JSON.parse(hit) as { metrics: SuccessMetrics; computedAt: string };
  }
  const value = { metrics: await successMetrics(campus, windowDays), computedAt: new Date().toISOString() };
  await kv.set(key, JSON.stringify(value), CACHE_SECONDS).catch(() => undefined);
  return value;
}
