import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { container } from '@/server/container';
import { JARGON_SYSTEM, jargonSchema } from '@/server/modules/ai/prompts';
import JargonTerm from '@/models/career/JargonTerm';

const schema = z.object({ term: z.string().trim().min(2).max(80) });

/** Plain-English explainer for a business term (Open Edition). Cached per term. */
export const POST = route({ body: schema, rateLimit: 'ai', feature: 'jargon' }, async ({ actor, body }) => {
  const { kv, ai } = container();
  const key = `jargon:${body.term.toLowerCase()}`;
  // The glossary answers first; the assistant only for terms nobody has asked about.
  const known = await JargonTerm.findOneAndUpdate({ key: body.term.trim().toLowerCase() }, { $inc: { lookups: 1 } }).lean();
  if (known) return ok({ explanation: { term: known.term, plainEnglish: known.plainEnglish, example: known.example, interviewTip: known.interviewTip, related: known.related }, cached: true });
  const cached = await kv.get(key);
  if (cached) return ok({ explanation: JSON.parse(cached), cached: true });

  const explanation = await ai.structured({
    system: JARGON_SYSTEM,
    prompt: `Explain: ${body.term}`,
    schema: jargonSchema,
    effort: 'low',
    maxTokens: 2000,
    userId: actor.id,
    feature: 'jargon',
  });
  await kv.set(key, JSON.stringify(explanation), 60 * 60 * 24 * 30);
  await JargonTerm.updateOne(
    { key: body.term.trim().toLowerCase() },
    { $setOnInsert: { term: explanation.term || body.term.trim(), plainEnglish: explanation.plainEnglish, example: explanation.example, interviewTip: explanation.interviewTip, related: explanation.related, source: 'ai', lookups: 1 } },
    { upsert: true }
  ).catch(() => undefined);
  return ok({ explanation, cached: false });
});
