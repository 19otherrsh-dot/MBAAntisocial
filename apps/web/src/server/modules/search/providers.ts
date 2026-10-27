import User from '@/models/User';
import Resource from '@/models/Resource';
import Post from '@/models/Post';
import InterviewQuestion from '@/models/InterviewQuestion';
import CaseComp from '@/models/CaseComp';
import type { SearchProvider } from './types';

const people: SearchProvider = {
  type: 'person',
  label: 'People',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const rows = await User.find({ campus: actor.campus, name: pattern, suspendedAt: { $exists: false } })
      .select('name role batch')
      .limit(limit)
      .lean();
    return rows.map((u) => ({
      id: String(u._id),
      type: 'person',
      title: u.name,
      subtitle: `${u.role === 'alumni' ? 'Alumni' : u.role === 'mentor' ? 'Senior' : 'Student'} · ${u.batch}`,
      href: `/u/${u._id}`,
    }));
  },
};

const resources: SearchProvider = {
  type: 'resource',
  label: 'Notes',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const rows = await Resource.find({ campus: actor.campus, hiddenAt: { $exists: false }, $or: [{ title: pattern }, { course: pattern }] })
      .select('title course')
      .limit(limit)
      .lean();
    return rows.map((r) => ({ id: String(r._id), type: 'resource', title: r.title, subtitle: r.course, href: `/resources?focus=${r._id}` }));
  },
};

const posts: SearchProvider = {
  type: 'post',
  label: 'Feed',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const rows = await Post.find({ campus: actor.campus, hiddenAt: { $exists: false }, content: pattern })
      .select('content createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return rows.map((p) => ({ id: String(p._id), type: 'post', title: p.content.slice(0, 80), href: `/feed?post=${p._id}` }));
  },
};

const companies: SearchProvider = {
  type: 'company',
  label: 'Companies',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const rows = await InterviewQuestion.aggregate<{ _id: string; company: string; count: number }>([
      { $match: { campus: actor.campus, company: pattern, hiddenAt: { $exists: false } } },
      { $group: { _id: '$companyKey', company: { $first: '$company' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
    return rows.map((c) => ({
      id: c._id,
      type: 'company',
      title: c.company,
      subtitle: `${c.count} logged question${c.count === 1 ? '' : 's'}`,
      href: `/companies/${encodeURIComponent(c._id)}`,
    }));
  },
};

const comps: SearchProvider = {
  type: 'comp',
  label: 'Competitions',
  campusOnly: false,
  async search(_actor, pattern, limit) {
    const rows = await CaseComp.find({ archivedAt: { $exists: false }, title: pattern }).select('title registrationDeadline').limit(limit).lean();
    return rows.map((c) => ({ id: String(c._id), type: 'comp', title: c.title, subtitle: 'Competition', href: `/comps?focus=${c._id}` }));
  },
};

/** Every module's provider. Later modules append theirs. */
export async function searchProviders(): Promise<SearchProvider[]> {
  const extra = await Promise.all([
    import('../hub/search').then((m) => m.hubSearchProviders).catch(() => []),
    import('../games/search').then((m) => m.gameSearchProviders).catch(() => []),
    import('../campus-life/search').then((m) => m.campusLifeSearchProviders).catch(() => []),
  ]);
  return [people, companies, resources, posts, comps, ...extra.flat()];
}
