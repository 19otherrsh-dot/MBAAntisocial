import { route, ok, created } from '@/lib/api/handler';
import { listConversations, startConversation } from '@/server/modules/hub/dm';
import { startDmSchema } from '@/server/modules/hub/schemas';

export const GET = route({ feature: 'hub' }, async ({ actor }) => ok({ conversations: await listConversations(actor.id) }));

export const POST = route({ body: startDmSchema, rateLimit: 'write', feature: 'hub' }, async ({ actor, body }) => {
  const conversation = await startConversation(actor, body.userIds, body.name);
  return created({ conversationId: String(conversation._id) });
});
