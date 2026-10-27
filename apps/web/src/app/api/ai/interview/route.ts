import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { container } from '@/server/container';
import { chatTurnsSchema, textStreamResponse } from '@/server/modules/ai/chat-input';
import { INTERVIEW_STYLES, INTERVIEW_TRACKS, interviewerSystem } from '@/server/modules/ai/prompts';

const schema = z.object({
  messages: chatTurnsSchema,
  track: z.enum(INTERVIEW_TRACKS).default('general_management'),
  style: z.enum(INTERVIEW_STYLES).default('personal'),
  company: z.string().trim().max(60).optional(),
});

/** Streamed AI mock interviewer — the fallback when no senior slot is free (§6.1 V3). */
export const POST = route({ body: schema, rateLimit: 'ai', feature: 'ai_interview' }, async ({ actor, body }) => {
  const messages = body.messages.length
    ? body.messages
    : [{ role: 'user' as const, content: 'I am ready. Please start the interview.' }];
  const stream = await container().ai.streamChat({
    system: interviewerSystem({ name: actor.name, year: actor.year, campus: actor.campus, ...body }),
    messages,
    effort: 'low',
    maxTokens: 2000,
    userId: actor.id,
    feature: 'ai_interview',
  });
  return textStreamResponse(stream);
});
