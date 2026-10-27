import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { container } from '@/server/container';
import { scorecardSchema, scorecardSystem } from '@/server/modules/ai/prompts';

const schema = z.object({
  kind: z.enum(['interview', 'gd']),
  transcript: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).min(2).max(80),
});

/** Structured scorecard for a finished AI interview or GD. */
export const POST = route({ body: schema, rateLimit: 'ai', feature: 'ai_interview' }, async ({ actor, body }) => {
  const transcript = body.transcript
    .map((t) => `${t.role === 'user' ? 'CANDIDATE' : body.kind === 'gd' ? 'GROUP' : 'INTERVIEWER'}: ${t.content}`)
    .join('\n\n');
  const scorecard = await container().ai.structured({
    system: scorecardSystem(body.kind),
    prompt: `Transcript:\n\n${transcript}`,
    schema: scorecardSchema,
    effort: 'medium',
    userId: actor.id,
    feature: `scorecard_${body.kind}`,
  });
  return ok({ scorecard });
});
