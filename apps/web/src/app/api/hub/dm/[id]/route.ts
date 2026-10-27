import { z } from 'zod';
import { route, ok, created } from '@/lib/api/handler';
import { listDirectMessages, postDirectMessage, requireConversation } from '@/server/modules/hub/dm';
import { dmMessageSchema } from '@/server/modules/hub/schemas';

const querySchema = z.object({ before: z.coerce.date().optional() });

export const GET = route({ query: querySchema, feature: 'hub' }, async ({ actor, params, query }) => {
  const conversation = await requireConversation(actor.id, params.id);
  const messages = await listDirectMessages(actor.id, params.id, query.before);
  return ok({
    conversation: { ...conversation, _id: String(conversation._id) },
    messages,
    hasMore: messages.length === 50,
  });
});

export const POST = route({ body: dmMessageSchema, rateLimit: 'chat', feature: 'hub' }, async ({ actor, params, body }) => {
  return created({ message: await postDirectMessage(actor.id, params.id, body.content, body.attachments) });
});
