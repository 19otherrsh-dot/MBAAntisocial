import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import JargonTerm from '@/models/career/JargonTerm';

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.enum(['finance', 'strategy', 'marketing', 'operations', 'economics', 'tech', 'hr', 'general']).optional(),
});

/** The glossary: curated terms plus everything the assistant has explained before. */
export const GET = route({ feature: 'jargon', query: querySchema }, async ({ query }) => {
  const filter: Record<string, unknown> = {};
  if (query.category) filter.category = query.category;
  if (query.q) filter.term = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const terms = await JargonTerm.find(filter).sort({ term: 1 }).limit(query.q ? 20 : 300).lean();
  const total = await JargonTerm.countDocuments();
  // A different featured term each day, the same for everyone.
  const featured = total ? await JargonTerm.findOne({ source: 'curated' }).skip(Math.floor(Date.now() / 86_400_000) % Math.max(1, await JargonTerm.countDocuments({ source: 'curated' }))).lean() : null;
  const shape = (t: (typeof terms)[number]) => ({ _id: String(t._id), term: t.term, plainEnglish: t.plainEnglish, example: t.example, interviewTip: t.interviewTip, related: t.related, category: t.category, source: t.source });
  return ok({ terms: terms.map(shape), featured: featured ? shape(featured) : null, total });
});
