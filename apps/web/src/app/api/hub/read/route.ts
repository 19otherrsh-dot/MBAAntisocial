import { route, ok } from '@/lib/api/handler';
import { readSchema } from '@/server/modules/hub/schemas';
import { requireChannel, requireConversationAccess } from '@/server/modules/hub/message-access';
import { markRead } from '@/server/modules/hub/messages';

export const POST = route({ body: readSchema, rateLimit: 'hub', feature: 'hub' }, async ({ actor, body }) => {
  if (body.kind === 'channel') await requireChannel(actor.id, body.targetId);
  else await requireConversationAccess(actor.id, body.targetId);
  await markRead(actor.id, body.targetId, body.kind);
  return ok({ read: true });
});
