import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { container } from '@/server/container';

const schema = z.object({
  bullet: z.string().trim().min(8).max(300),
  role: z.string().trim().max(120).default(''),
  target: z.string().trim().max(80).default(''),
});

const outSchema = z.object({
  options: z.array(z.string()).min(2).max(3).describe('Rewrites, strongest first'),
  missing: z.string().describe('One line on what number or detail would make it stronger, if anything; empty if nothing'),
});

const SYSTEM = `You rewrite single resume bullets for Indian MBA students applying to consulting, finance, product, and general-management roles.
Each rewrite starts with a strong past-tense verb, shows the action and the result, and stays under 28 words.
Never invent numbers, names, or outcomes that are not in the original. If a metric is missing, keep a clear placeholder like [X%] and say so in "missing".`;

/** Three tighter versions of one bullet. Facts stay the student's own. */
export const POST = route({ body: schema, rateLimit: 'ai', feature: 'resume' }, async ({ actor, body }) => {
  const result = await container().ai.structured({
    system: SYSTEM,
    prompt: `Role: ${body.role || 'unspecified'}\nTarget: ${body.target || 'unspecified'}\nBullet: ${body.bullet}`,
    schema: outSchema,
    effort: 'low',
    maxTokens: 1500,
    userId: actor.id,
    feature: 'resume_bullet',
  });
  return ok(result);
});
