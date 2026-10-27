import { requireChannel } from './access';
import { requireConversation } from './dm';

/** Shared guards for routes that act on a message in either a channel or a DM. */
export { requireChannel };

export async function requireConversationAccess(userId: string, conversationId: string) {
  return requireConversation(userId, conversationId);
}
