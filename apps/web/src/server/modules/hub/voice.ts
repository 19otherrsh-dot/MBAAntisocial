import { hasPermission } from '@mba/shared/hub';
import type { Actor } from '@/lib/api/handler';
import type { RoomAccess } from '../meet/rooms';
import { channelContext } from './access';

/** Voice channels map to LiveKit rooms named `hub-<channelId>`. */
export async function voiceRoomAccess(actor: Actor, channelId: string): Promise<RoomAccess> {
  const access = await channelContext(actor.id, channelId);
  if (!access || access.channel.kind !== 'voice' || !hasPermission(access.perms, 'CONNECT_VOICE')) {
    return { allowed: false, title: '', canPublish: false, backHref: '/hub' };
  }
  return {
    allowed: true,
    title: `🔊 ${access.channel.name}`,
    canPublish: hasPermission(access.perms, 'SPEAK'),
    backHref: `/hub/${access.ctx.server._id}`,
  };
}
