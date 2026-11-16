import { NextResponse } from 'next/server';
import { route } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { getPusher } from '@/lib/pusherServer';
import { parseChannel } from '@/lib/realtime';
import StudyRoom from '@/models/StudyRoom';

/**
 * Signs a private-channel subscription.
 *
 * This is the whole access check for realtime delivery: a caller may join
 * their own user channel, and a room channel only for a live room they could
 * also read over HTTP. Anything else is refused, so knowing an id is no longer
 * enough to listen in.
 */
export const POST = route({ rateLimit: 'chat' }, async ({ request, actor }) => {
  const pusher = getPusher();
  if (!pusher) throw new ApiError(503, 'realtime_unavailable', 'Realtime is not configured.');

  let socketId = '';
  let channelName = '';
  try {
    const form = await request.formData();
    socketId = String(form.get('socket_id') ?? '');
    channelName = String(form.get('channel_name') ?? '');
  } catch {
    throw ApiError.badRequest('Expected a channel authorisation request.');
  }

  if (!/^\d+\.\d+$/.test(socketId)) throw ApiError.badRequest('Invalid socket id.');

  const channel = parseChannel(channelName);
  if (!channel) throw ApiError.forbidden('Unknown channel.');

  if (channel.kind === 'user') {
    if (channel.id !== actor.id) throw ApiError.forbidden('That channel is not yours.');
  } else {
    const room = await StudyRoom.findOne({ _id: channel.id, expiresAt: { $gt: new Date() } })
      .select('campus isGlobal')
      .lean();
    if (!room || (!room.isGlobal && room.campus !== actor.campus)) {
      throw ApiError.forbidden('That room is not open to you.');
    }
  }

  return NextResponse.json(pusher.authorizeChannel(socketId, channelName));
});
