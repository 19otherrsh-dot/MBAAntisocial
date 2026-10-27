import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { GAME_CHANNEL_PREFIX, type Bus } from '../bus.js';

/**
 * Membership and delivery for game rooms across realtime instances.
 *
 * A player's socket lives on whichever instance the load balancer picked, so
 * peers in one room may be split across machines. Membership is a Redis hash
 * (peerId → instance), and frames for a peer on another instance travel over
 * the bus. With no Redis, everything is local and the same code path holds.
 */
export type HubMode = 'signal' | 'relay';

export interface LocalPeer {
  peerId: number;
  userId: string;
  seat: number;
  ws: WebSocket;
}

interface Wire {
  room: string;
  mode: HubMode;
  to: number | '*';
  except?: number;
  binary: boolean;
  data: string;
}

const MEMBERSHIP_TTL_SECONDS = 6 * 60 * 60;

export class RoomHub {
  readonly instanceId = randomUUID();
  private readonly local = new Map<string, Map<number, LocalPeer>>();
  /** Membership for the no-Redis case. */
  private readonly memory = new Map<string, Map<number, string>>();

  constructor(private readonly bus: Bus) {
    bus.onMessage((channel, message) => {
      if (!channel.startsWith(GAME_CHANNEL_PREFIX)) return;
      try {
        const wire = JSON.parse(message) as Wire;
        this.deliverLocal(wire);
      } catch {
        /* ignore */
      }
    });
    void bus.psubscribe(`${GAME_CHANNEL_PREFIX}*`);
  }

  private key(room: string, mode: HubMode) {
    return `${room}:${mode}`;
  }

  private membershipKey(room: string, mode: HubMode) {
    return `mba:gameroom:${room}:${mode}`;
  }

  /** Registers a peer and returns the ids of everyone already in the room. */
  async join(room: string, mode: HubMode, peer: LocalPeer): Promise<number[]> {
    const k = this.key(room, mode);
    let peers = this.local.get(k);
    if (!peers) this.local.set(k, (peers = new Map()));

    // A reconnect from the same peer id replaces the stale socket.
    const stale = peers.get(peer.peerId);
    if (stale && stale.ws !== peer.ws) stale.ws.close(4001, 'replaced');
    peers.set(peer.peerId, peer);

    if (this.bus.redis) {
      const mk = this.membershipKey(room, mode);
      const existing = await this.bus.redis.hkeys(mk);
      await this.bus.redis.multi().hset(mk, String(peer.peerId), this.instanceId).expire(mk, MEMBERSHIP_TTL_SECONDS).exec();
      return existing.map(Number).filter((id) => id !== peer.peerId);
    }
    let members = this.memory.get(k);
    if (!members) this.memory.set(k, (members = new Map()));
    const existing = [...members.keys()].filter((id) => id !== peer.peerId);
    members.set(peer.peerId, this.instanceId);
    return existing;
  }

  async leave(room: string, mode: HubMode, peer: LocalPeer): Promise<void> {
    const k = this.key(room, mode);
    const peers = this.local.get(k);
    if (peers?.get(peer.peerId)?.ws === peer.ws) {
      peers.delete(peer.peerId);
      if (peers.size === 0) this.local.delete(k);
      if (this.bus.redis) await this.bus.redis.hdel(this.membershipKey(room, mode), String(peer.peerId));
      else this.memory.get(k)?.delete(peer.peerId);
    }
  }

  async members(room: string, mode: HubMode): Promise<number[]> {
    if (this.bus.redis) return (await this.bus.redis.hkeys(this.membershipKey(room, mode))).map(Number);
    return [...(this.memory.get(this.key(room, mode))?.keys() ?? [])];
  }

  /** Sends to one peer, wherever it is connected. */
  async sendTo(room: string, mode: HubMode, to: number, data: string | Buffer): Promise<void> {
    await this.route({ room, mode, to, binary: Buffer.isBuffer(data), data: encode(data) });
  }

  /** Sends to every peer in the room except `except`. */
  async broadcast(room: string, mode: HubMode, except: number | undefined, data: string | Buffer): Promise<void> {
    await this.route({ room, mode, to: '*', except, binary: Buffer.isBuffer(data), data: encode(data) });
  }

  private async route(wire: Wire) {
    // Deliver locally first; remote instances get it over the bus.
    this.deliverLocal(wire);
    if (this.bus.shared) await this.bus.publish(`${GAME_CHANNEL_PREFIX}${wire.room}`, JSON.stringify({ ...wire, origin: this.instanceId }));
  }

  private deliverLocal(wire: Wire & { origin?: string }) {
    if (wire.origin === this.instanceId) return; // Already delivered on the way out.
    const peers = this.local.get(this.key(wire.room, wire.mode));
    if (!peers) return;
    const payload = wire.binary ? Buffer.from(wire.data, 'base64') : wire.data;
    for (const peer of peers.values()) {
      if (wire.to !== '*' && peer.peerId !== wire.to) continue;
      if (wire.except !== undefined && peer.peerId === wire.except) continue;
      if (peer.ws.readyState === peer.ws.OPEN) peer.ws.send(payload, { binary: wire.binary });
    }
  }
}

function encode(data: string | Buffer): string {
  return Buffer.isBuffer(data) ? data.toString('base64') : data;
}

/**
 * Deterministic peer ids so no coordination is needed: the host is 1 (Godot's
 * server peer), seated players are seat + 2, spectators draw from 100+.
 */
export function peerIdFor(seat: number, host: boolean): number {
  if (host) return 1;
  if (seat >= 0) return seat + 2;
  return 100 + Math.floor(Math.random() * 100_000);
}

/** Simple token bucket so one client cannot flood a room. */
export class FrameLimiter {
  private tokens: number;
  private last = Date.now();
  constructor(private readonly ratePerSecond: number, private readonly burst: number) {
    this.tokens = burst;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
