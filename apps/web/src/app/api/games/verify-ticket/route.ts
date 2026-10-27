import type { NextRequest } from 'next/server';
import { ok } from '@/lib/api/handler';
import { ApiError, toErrorResponse } from '@/lib/api/errors';
import { verifyGameTicket, verifyServerToken } from '@/server/modules/realtime/tokens';
import { verifyTicketSchema } from '@/server/modules/games/schemas';

/**
 * Lets a dedicated server check the ticket a client forwarded in its first
 * message, so it knows which user and seat a peer is without trusting the client.
 */
export async function POST(request: NextRequest) {
  try {
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const server = await verifyServerToken(token);
    if (!server) throw ApiError.unauthorized('Unknown game server.');
    const { ticket } = verifyTicketSchema.parse(await request.json().catch(() => ({})));
    const claims = await verifyGameTicket(ticket);
    if (!claims || claims.room !== server.room) return ok({ valid: false });
    return ok({ valid: true, userId: claims.sub, name: claims.name, seat: claims.seat, host: claims.host });
  } catch (error) {
    return toErrorResponse(error);
  }
}
