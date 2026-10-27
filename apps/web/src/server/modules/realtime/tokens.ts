import { SignJWT, jwtVerify } from 'jose';
import type { GameTicketClaims, RealtimeTokenClaims } from '@mba/shared/realtime';
import { env } from '@/lib/env';

const key = () => new TextEncoder().encode(env.realtimeSecret);

/** Socket handshake token: short-lived, re-minted by the client on reconnect. */
export async function mintSocketToken(claims: Omit<RealtimeTokenClaims, 'use'>): Promise<string> {
  return new SignJWT({ ...claims, use: 'socket' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(key());
}

/** Ticket a game build presents to the signaling server, relay, or dedicated server. */
export async function mintGameTicket(claims: Omit<GameTicketClaims, 'use'>, ttl = '2h'): Promise<string> {
  return new SignJWT({ ...claims, use: 'game' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(key());
}

export async function verifyGameTicket(token: string): Promise<GameTicketClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload.use === 'game' ? (payload as unknown as GameTicketClaims) : null;
  } catch {
    return null;
  }
}

/** Token a dedicated Godot server presents when reporting results or verifying tickets. */
export async function verifyServerToken(token: string): Promise<{ room: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload.use === 'game-server' && typeof payload.room === 'string' ? { room: payload.room } : null;
  } catch {
    return null;
  }
}
