import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import CompanyPage from '@/models/career/CompanyPage';
import InterviewQuestion from '@/models/InterviewQuestion';
import Application, { companyKeyOf } from '@/models/Application';
import Offer from '@/models/Offer';

const querySchema = z.object({ q: z.string().trim().max(60).optional() });

/**
 * Every recruiter the campus has touched — wiki pages, plus companies that
 * only appear in logged questions, applications, or offers so far — with how
 * much the campus knows about each.
 */
export const GET = route({ feature: 'wiki', query: querySchema }, async ({ actor, query }) => {
  const campus = actor.campus;
  const [pages, questions, applications, offers] = await Promise.all([
    CompanyPage.find({ campus }).select('key name sector updatedAt revisions').lean(),
    InterviewQuestion.aggregate<{ _id: string; name: string; count: number }>([{ $match: { campus } }, { $group: { _id: '$companyKey', name: { $first: '$company' }, count: { $sum: 1 } } }]),
    Application.aggregate<{ _id: string; name: string; count: number }>([{ $match: { campus } }, { $group: { _id: '$companyKey', name: { $first: '$company' }, count: { $sum: 1 } } }]),
    Offer.aggregate<{ _id: string; count: number }>([{ $match: { campus } }, { $group: { _id: '$company', count: { $sum: 1 } } }]),
  ]);
  const rows = new Map<string, { key: string; name: string; sector: string; hasPage: boolean; questions: number; applicants: number; offers: number; updatedAt?: Date; editors: number }>();
  const upsert = (key: string, name: string) => {
    if (!key) return null;
    if (!rows.has(key)) rows.set(key, { key, name, sector: '', hasPage: false, questions: 0, applicants: 0, offers: 0, editors: 0 });
    return rows.get(key)!;
  };
  for (const p of pages) Object.assign(upsert(p.key, p.name)!, { hasPage: true, sector: p.sector, updatedAt: p.updatedAt, editors: new Set(p.revisions.map((r) => String(r.editor))).size });
  for (const q of questions) { const r = upsert(q._id, q.name); if (r) r.questions = q.count; }
  for (const a of applications) { const r = upsert(a._id, a.name); if (r) r.applicants = a.count; }
  for (const o of offers) { const r = upsert(companyKeyOf(o._id), o._id); if (r) r.offers = o.count; }
  let list = [...rows.values()];
  if (query.q) {
    const needle = query.q.toLowerCase();
    list = list.filter((r) => r.name.toLowerCase().includes(needle));
  }
  list.sort((a, b) => b.questions + b.applicants + b.offers * 2 - (a.questions + a.applicants + a.offers * 2) || a.name.localeCompare(b.name));
  return ok({ companies: list.slice(0, 200) });
});

const createSchema = z.object({ name: z.string().trim().min(2).max(120), sector: z.string().trim().max(60).default(''), website: z.union([z.literal(''), z.string().url().max(300)]).default('') });

export const POST = route({ feature: 'wiki', body: createSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const key = companyKeyOf(body.name);
  if (!key) throw ApiError.unprocessable('That name does not look like a company.');
  const existing = await CompanyPage.findOne({ campus: actor.campus, key }).select('key').lean();
  if (existing) return ok({ key: existing.key });
  await CompanyPage.create({ campus: actor.campus, key, name: body.name, sector: body.sector, website: body.website });
  return created({ key });
});
