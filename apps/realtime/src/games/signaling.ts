import type { WebSocket } from 'ws';
import type { GameTicketClaims } from '@mba/shared/realtime';
import { SIGNAL, parseSignalFrame } from '@mba/shared/games';
import { FrameLimiter, peerIdFor, RoomHub, type LocalPeer } from './room-hub.js';
import { reportPeerJoined, reportPeerLeft } from '../web.js';

const MAX_FRAME = 64 * 1024;

function frame(type: number, id: number, data = ''): string {
  return JSON.stringify({ type, id, data });
}

/**
 * WebRTC signaling, protocol-compatible with Godot's official
 * `networking/webrtc_signaling` demo so existing games only change the URL.
 *
 * Differences from the demo server, all invisible to a conforming client:
 * - the lobby is the platform room in the signed ticket (JOIN's lobby name is
 *   ignored), so nobody can wander into another room by guessing a name;
 * - peer ids are deterministic: host = 1, seat n = n + 2;
 * - relaying works across realtime instances through the room hub.
 */
export function handleSignaling(ws: WebSocket, ticket: GameTicketClaims, hub: RoomHub) {
  const peer: LocalPeer = { peerId: peerIdFor(ticket.seat, ticket.host), userId: ticket.sub, seat: ticket.seat, ws };
  const limiter = new FrameLimiter(40, 200);
  let joined = false;
  let mesh = true;

  // Godot clients that never send JOIN are dropped.
  const joinTimer = setTimeout(() => {
    if (!joined) ws.close(4000, 'join timeout');
  }, 15_000);

  ws.on('message', async (raw, isBinary) => {
    if (isBinary || !limiter.take()) return;
    const text = raw.toString();
    if (text.length > MAX_FRAME) return ws.close(1009, 'frame too large');
    const msg = parseSignalFrame(text);
    if (!msg) return;

    if (msg.type === SIGNAL.JOIN) {
      if (joined) return;
      joined = true;
      clearTimeout(joinTimer);
      // Godot demo client: id 0 means mesh, 1 means client/server.
      mesh = msg.id === 0;
      ws.send(frame(SIGNAL.ID, peer.peerId, mesh ? 'true' : ''));
      const others = await hub.join(ticket.room, 'signal', peer);
      for (const other of others) {
        ws.send(frame(SIGNAL.PEER_CONNECT, other));
        await hub.sendTo(ticket.room, 'signal', other, frame(SIGNAL.PEER_CONNECT, peer.peerId));
      }
      ws.send(frame(SIGNAL.JOIN, 0, ticket.room));
      void reportPeerJoined(ticket.room, ticket.sub);
      return;
    }

    if (!joined) return;

    if (msg.type === SIGNAL.OFFER || msg.type === SIGNAL.ANSWER || msg.type === SIGNAL.CANDIDATE) {
      // Client addresses the destination in `id`; the receiver sees the sender.
      const members = await hub.members(ticket.room, 'signal');
      if (!members.includes(msg.id) || msg.id === peer.peerId) return;
      await hub.sendTo(ticket.room, 'signal', msg.id, frame(msg.type, peer.peerId, msg.data));
      return;
    }

    if (msg.type === SIGNAL.SEAL && ticket.host) {
      await hub.broadcast(ticket.room, 'signal', undefined, frame(SIGNAL.SEAL, 0));
    }
  });

  ws.on('close', async () => {
    clearTimeout(joinTimer);
    if (!joined) return;
    await hub.leave(ticket.room, 'signal', peer);
    await hub.broadcast(ticket.room, 'signal', peer.peerId, frame(SIGNAL.PEER_DISCONNECT, peer.peerId));
    void reportPeerLeft(ticket.room, ticket.sub);
  });
}
