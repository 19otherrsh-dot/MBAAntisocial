import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { objectId } from '@/lib/validation';
import HubMessage from '@/models/hub/HubMessage';
import { requireChannel, requireConversationAccess } from '@/server/modules/hub/message-access';
import { toggleReaction } from '@/server/modules/hub/messages';
import { reactionSchema } from '@/server/modules/hub/schemas';

export const POST = route({ body: reactionSchema, rateLimit: 'hub', feature: 'hub' }, async ({ actor, params, body }) => {
  const id = objectId.parse(params.id);
  const message = await HubMessage.findById(id).select('channel conversation').lean();
  if (!message) throw ApiError.notFound('That message no longer exists.');
  if (message.conversation) await requireConversationAccess(actor.id, String(message.conversation));
  else await requireChannel(actor.id, String(message.channel), 'ADD_REACTIONS');
  return ok({ reactions: await toggleReaction(id, actor.id, body.emoji) });
});
