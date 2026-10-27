import { z } from 'zod';
import { route } from '@/lib/api/handler';
import { container } from '@/server/container';
import { chatTurnsSchema, textStreamResponse } from '@/server/modules/ai/chat-input';
import { gdSystem } from '@/server/modules/ai/prompts';

const schema = z.object({
  messages: chatTurnsSchema,
  topic: z.string().trim().min(5).max(200),
  participants: z.number().int().min(2).max(4).default(3),
});

/** Solo GD practice: the model voices the rest of the group. */
export const POST = route({ body: schema, rateLimit: 'ai', feature: 'ai_interview' }, async ({ actor, body }) => {
  const messages = body.messages.length
    ? body.messages
    : [{ role: 'user' as const, content: '(The moderator has announced the topic. The discussion begins.)' }];
  const stream = await container().ai.streamChat({
    system: gdSystem({ name: actor.name.split(' ')[0], topic: body.topic, participants: body.participants }),
    messages,
    effort: 'low',
    maxTokens: 2000,
    userId: actor.id,
    feature: 'ai_gd',
  });
  return textStreamResponse(stream);
});
