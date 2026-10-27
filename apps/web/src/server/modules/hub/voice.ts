import type { Actor } from '@/lib/api/handler';
import type { RoomAccess } from '../meet/rooms';

/** Replaced by the hub module's voice-channel authoriser. */
export async function voiceRoomAccess(_actor: Actor, _channelId: string): Promise<RoomAccess> {
  return { allowed: false, title: '', canPublish: false, backHref: '/hub' };
}
