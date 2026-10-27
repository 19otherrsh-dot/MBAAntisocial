import { route, ok } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { hasPermission } from '@mba/shared/hub';
import { objectId } from '@/lib/validation';
import HubMessage from '@/models/hub/HubMessage';
import { requireChannel, requireConversationAccess } from '@/server/modules/hub/message-access';
import { deleteMessage, editMessage, markUseful, setPinned } from '@/server/modules/hub/messages';
import { messageActionSchema } from '@/server/modules/hub/schemas';

export const PATCH = route({ body: messageActionSchema, rateLimit: 'hub', feature: 'hub' }, async ({ actor, params, body }) => {
  const id = objectId.parse(params.id);
  const message = await HubMessage.findById(id).select('channel conversation author thread').lean();
  if (!message) throw ApiError.notFound('That message no longer exists.');

  if (message.conversation) {
    await requireConversationAccess(actor.id, String(message.conversation));
    if (body.action !== 'edit') throw ApiError.badRequest('That does not apply to direct messages.');
    return ok({ message: await editMessage(id, actor.id, body.content) });
  }

  const access = await requireChannel(actor.id, String(message.channel));
  switch (body.action) {
    case 'edit':
      return ok({ message: await editMessage(id, actor.id, body.content) });
    case 'pin':
    case 'unpin':
      if (!hasPermission(access.perms, 'PIN_MESSAGES')) throw ApiError.forbidden('Only moderators can pin messages.');
      return ok({ message: await setPinned(id, body.action === 'pin') });
    case 'useful': {
      // The thread starter or a moderator marks the answer that solved it.
      const root = message.thread ? await HubMessage.findById(message.thread).select('author').lean() : null;
      const isAsker = root && String(root.author) === actor.id;
      if (!isAsker && !hasPermission(access.perms, 'MANAGE_MESSAGES')) throw ApiError.forbidden('Only the person who asked can mark an answer.');
      if (body.value && message.author && String(message.author) !== actor.id) {
        const { award } = await import('@/lib/gamification');
        await award(String(message.author), 'hub_answer_useful', { entityType: 'hub_message', entity: id });
      }
      return ok({ message: await markUseful(id, body.value) });
    }
  }
});

export const DELETE = route({ rateLimit: 'hub', feature: 'hub' }, async ({ actor, params }) => {
  const id = objectId.parse(params.id);
  const message = await HubMessage.findById(id).select('channel conversation').lean();
  if (!message) throw ApiError.notFound('That message no longer exists.');
  if (message.conversation) {
    await requireConversationAccess(actor.id, String(message.conversation));
    return ok(await deleteMessage(id, actor.id, false));
  }
  const access = await requireChannel(actor.id, String(message.channel));
  return ok(await deleteMessage(id, actor.id, hasPermission(access.perms, 'MANAGE_MESSAGES')));
});
