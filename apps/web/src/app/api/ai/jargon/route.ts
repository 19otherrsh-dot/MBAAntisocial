import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { container } from '@/server/container';
import { JARGON_SYSTEM, jargonSchema } from '@/server/modules/ai/prompts';

const schema = z.object({ term: z.string().trim().min(2).max(80) });

/** Plain-English explainer for a business term (Open Edition). Cached per term. */
export const POST = route({ body: schema, rateLimit: 'ai', feature: 'jargon' }, async ({ actor, body }) => {
  const { kv, ai } = container();
  const key = `jargon:${body.term.toLowerCase()}`;
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
  return ok({ explanation, cached: false });
});
