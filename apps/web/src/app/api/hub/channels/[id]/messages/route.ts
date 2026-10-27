import { route, ok, created } from '@/lib/api/handler';
import { requireChannel } from '@/server/modules/hub/access';
import { listChannelMessages, postChannelMessage } from '@/server/modules/hub/messages';
import { messageQuerySchema, postMessageSchema } from '@/server/modules/hub/schemas';

/** A page of a channel's timeline, a thread, or its pins. */
export const GET = route({ query: messageQuerySchema, feature: 'hub' }, async ({ actor, params, query }) => {
  const access = await requireChannel(actor.id, params.id);
  const messages = await listChannelMessages(access, actor.id, query);
  return ok({ messages, hasMore: messages.length === query.limit });
});

export const POST = route({ body: postMessageSchema, rateLimit: 'hub', feature: 'hub' }, async ({ actor, params, body }) => {
  const access = await requireChannel(actor.id, params.id);
  const message = await postChannelMessage(access, actor.id, body);
  return created({ message });
});
