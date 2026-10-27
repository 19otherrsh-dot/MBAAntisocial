import type { NextRequest } from 'next/server';
import { ok } from '@/lib/api/handler';
import { ApiError, toErrorResponse } from '@/lib/api/errors';
import connectDB from '@/lib/mongodb';
import { verifyServerToken } from '@/server/modules/realtime/tokens';
import { serverReportSchema } from '@/server/modules/games/schemas';
import { serverReport } from '@/server/modules/games/results';

/**
 * Results from a dedicated Godot server. The bearer token is minted by the
 * realtime service for exactly one room, so a server can only report the room
 * it was started for.
 */
export async function POST(request: NextRequest) {
  try {
    const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const claims = await verifyServerToken(token);
    if (!claims) throw ApiError.unauthorized('Unknown game server.');
    const body = serverReportSchema.parse(await request.json().catch(() => ({})));
    if (body.roomId !== claims.room) throw ApiError.forbidden('That token is for another room.');
    await connectDB();
    const room = await serverReport(body.roomId, body.result);
    return ok({ status: room.status });
  } catch (error) {
    return toErrorResponse(error);
  }
}
