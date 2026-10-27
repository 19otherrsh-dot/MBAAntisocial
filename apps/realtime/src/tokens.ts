import { jwtVerify, SignJWT } from 'jose';
import type { GameTicketClaims, RealtimeTokenClaims } from '@mba/shared/realtime';
import { config } from './config.js';

const key = () => new TextEncoder().encode(config.realtimeSecret);

export async function verifySocketToken(token: string): Promise<RealtimeTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload.use === 'socket' && typeof payload.sub === 'string' ? (payload as unknown as RealtimeTokenClaims) : null;
  } catch {
    return null;
  }
}

export async function verifyGameTicket(token: string): Promise<GameTicketClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload.use === 'game' && typeof payload.room === 'string' ? (payload as unknown as GameTicketClaims) : null;
  } catch {
    return null;
  }
}

/** Token a dedicated Godot server uses to report results back to the web app. */
export async function mintServerToken(room: string): Promise<string> {
  return new SignJWT({ room, use: 'game-server' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('6h')
    .sign(key());
}
