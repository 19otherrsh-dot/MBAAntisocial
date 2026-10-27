import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { award } from '@/lib/gamification';
import CompanyPage, { WIKI_SECTIONS } from '@/models/career/CompanyPage';
import InterviewQuestion from '@/models/InterviewQuestion';
import Application from '@/models/Application';
import Offer from '@/models/Offer';
import User from '@/models/User';
import { companyKeyOf } from '@/models/Application';

/** Offers are only summarised past this many data points, so nobody can be singled out. */
const MIN_OFFER_SAMPLE = 3;
const MAX_REVISIONS = 60;

export const GET = route({ feature: 'wiki' }, async ({ actor, params }) => {
  const key = params.key.toLowerCase();
  const campus = actor.campus;
  const [page, questions, questionCount, apps, offers] = await Promise.all([
    CompanyPage.findOne({ campus, key }).lean(),
    InterviewQuestion.find({ campus, companyKey: key }).sort({ askedAt: -1 }).limit(6).select('question roundType role askedAt upvoteCount').lean(),
    InterviewQuestion.countDocuments({ campus, companyKey: key }),
    Application.aggregate<{ _id: string; count: number }>([{ $match: { campus, companyKey: key } }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
    Offer.find({ campus }).select('company baseSalary offerType role').lean(),
  ]);
  const companyOffers = offers.filter((o) => companyKeyOf(o.company) === key);
  const name =
    page?.name ??
    (await InterviewQuestion.findOne({ campus, companyKey: key }).select('company').lean())?.company ??
    (await Application.findOne({ campus, companyKey: key }).select('company').lean())?.company ??
    companyOffers[0]?.company;
  if (!page && questionCount === 0 && apps.length === 0 && companyOffers.length === 0) throw ApiError.notFound('Nobody on campus has written about this company yet.');

  const salaries = companyOffers.filter((o) => o.offerType === 'full_time').map((o) => o.baseSalary).sort((a, b) => a - b);
  const median = salaries.length ? salaries[Math.floor(salaries.length / 2)] : null;
  const alumni = await User.find({ campus, role: 'alumni', 'alumniProfile.company': new RegExp(`^${(page?.name ?? name ?? key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') }).select('name image alumniProfile').limit(8).lean();
  const editorIds = [...new Set((page?.revisions ?? []).map((r) => String(r.editor)))];
  const editors = await User.find({ _id: { $in: editorIds } }).select('name').lean();
  const editorName = new Map(editors.map((e) => [String(e._id), e.name]));

  return ok({
    company: {
      key,
      name: page?.name ?? name ?? key,
      sector: page?.sector ?? '',
      website: page?.website ?? '',
      sections: page?.sections ?? Object.fromEntries(WIKI_SECTIONS.map((s) => [s, ''])),
      updatedAt: page?.updatedAt ?? null,
      hasPage: Boolean(page),
      history: (page?.revisions ?? []).slice(-15).reverse().map((r) => ({ editor: editorName.get(String(r.editor)) ?? 'Someone', section: r.section, summary: r.summary, at: r.at })),
    },
    questions: { count: questionCount, recent: questions.map((q) => ({ _id: String(q._id), question: q.question, round: q.roundType, role: q.role, askedAt: q.askedAt, upvotes: q.upvoteCount ?? 0 })) },
    pipeline: Object.fromEntries(apps.map((a) => [a._id, a.count])),
    offers: salaries.length >= MIN_OFFER_SAMPLE ? { count: salaries.length, median, low: salaries[0], high: salaries[salaries.length - 1] } : { count: salaries.length, median: null, low: null, high: null },
    alumni: alumni.map((a) => ({ _id: String(a._id), name: a.name, image: a.image, designation: a.alumniProfile?.designation ?? '', referralsOpen: Boolean(a.alumniProfile?.referralsOpen) })),
  });
});

const editSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  section: z.enum(WIKI_SECTIONS),
  content: z.string().max(8000),
  summary: z.string().trim().max(200).default(''),
});

/** One section at a time; the previous text is kept in the history. */
export const PUT = route({ feature: 'wiki', body: editSchema, rateLimit: 'write' }, async ({ actor, params, body }) => {
  const key = params.key.toLowerCase();
  const page = await CompanyPage.findOne({ campus: actor.campus, key });
  const previous = page?.sections?.[body.section] ?? '';
  if (previous === body.content) return ok({ unchanged: true });
  const revision = { editor: actor.id, section: body.section, summary: body.summary, previous, at: new Date() };
  if (page) {
    page.sections[body.section] = body.content;
    page.revisions.push(revision as never);
    if (page.revisions.length > MAX_REVISIONS) page.revisions.splice(0, page.revisions.length - MAX_REVISIONS);
    page.markModified('sections');
    await page.save();
  } else {
    await CompanyPage.create({ campus: actor.campus, key, name: body.name ?? key, sections: { [body.section]: body.content }, revisions: [revision] });
  }
  // One award per page per person, however many edits — no farming by typo fixes.
  const target = await CompanyPage.findOne({ campus: actor.campus, key }).select('_id').lean();
  if (target && body.content.length - previous.length >= 40) await award(actor.id, 'wiki_edited', { entityType: 'CompanyPage', entity: target._id });
  return ok({ saved: true });
});
