import { parseTopic, type TopicKind } from '@mba/shared/realtime';
import User from '@/models/User';
import { campusEdition } from '../campus/service';

/**
 * Who may subscribe to which topic. The realtime service asks this on every
 * `subscribe`; it holds no rules of its own. Each topic kind has exactly one
 * authorizer, owned by the module that owns the data behind it.
 */
type Authorizer = (userId: string, id: string) => Promise<boolean>;

async function userCampusSlug(userId: string): Promise<string | null> {
  const user = await User.findById(userId).select('campus').lean();
  if (!user) return null;
  return (await campusEdition(user.campus)).slug;
}

const AUTHORIZERS: Record<TopicKind, Authorizer> = {
  user: async (userId, id) => userId === id,
  campus: async (userId, id) => (await userCampusSlug(userId)) === id,
  hubServer: async (userId, id) => (await import('../hub/access')).canSubscribeServer(userId, id),
  hubChannel: async (userId, id) => (await import('../hub/access')).canSubscribeChannel(userId, id),
  dm: async (userId, id) => (await import('../hub/access')).canSubscribeConversation(userId, id),
  gameRoom: async (userId, id) => (await import('../games/access')).canSubscribeRoom(userId, id),
  tournament: async (userId, id) => (await import('../games/access')).canSubscribeTournament(userId, id),
};

export async function authorizeTopic(userId: string, topic: string): Promise<boolean> {
  const parsed = parseTopic(topic);
  if (!parsed) return false;
  try {
    return await AUTHORIZERS[parsed.kind](userId, parsed.id);
  } catch (error) {
    console.error('[realtime] authorizer failed:', error);
    return false;
  }
}
