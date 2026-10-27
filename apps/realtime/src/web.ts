import { config } from './config.js';

/**
 * The only way this service learns domain facts: by asking the web app, which
 * owns every rule. Short timeouts so a slow web tier degrades to "denied"
 * rather than hanging sockets.
 */
async function call<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(new URL(path, config.WEB_INTERNAL_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': config.internalSecret },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const cache = new Map<string, { allowed: boolean; expires: number }>();
const CACHE_MS = 60_000;

export async function canSubscribe(userId: string, topic: string): Promise<boolean> {
  const key = `${userId}|${topic}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.allowed;
  try {
    const { allowed } = await call<{ allowed: boolean }>('/api/internal/realtime/authorize', { userId, topic });
    cache.set(key, { allowed, expires: Date.now() + (allowed ? CACHE_MS : 10_000) });
    if (cache.size > 50_000) cache.clear();
    return allowed;
  } catch (error) {
    console.error('[realtime] authorize failed:', (error as Error).message);
    return false;
  }
}

export interface DedicatedRoomInfo {
  gameId: string;
  version: string;
  serverPack: string;
  maxPlayers: number;
  status: string;
}

export async function dedicatedRoomInfo(roomId: string): Promise<DedicatedRoomInfo | null> {
  try {
    return await call<DedicatedRoomInfo>('/api/internal/games/room', { roomId });
  } catch {
    return null;
  }
}

export async function reportPeerLeft(roomId: string, userId: string): Promise<void> {
  await call('/api/internal/games/presence', { roomId, userId, present: false }).catch(() => undefined);
}

export async function reportPeerJoined(roomId: string, userId: string): Promise<void> {
  await call('/api/internal/games/presence', { roomId, userId, present: true }).catch(() => undefined);
}
