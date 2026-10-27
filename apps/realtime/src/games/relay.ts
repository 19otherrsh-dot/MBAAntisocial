import type { WebSocket } from 'ws';
import type { GameTicketClaims } from '@mba/shared/realtime';
import { FrameLimiter, peerIdFor, RoomHub, type LocalPeer } from './room-hub.js';
import { reportPeerJoined, reportPeerLeft } from '../web.js';

const MAX_FRAME = 64 * 1024;

/**
 * Room relay for games with their own protocol over a raw `WebSocketPeer`.
 *
 * - On connect the server sends `{"type":"relay_hello","peer":id,"seat":n,"peers":[...]}`.
 * - Peers arriving/leaving produce `relay_peer_joined` / `relay_peer_left`.
 * - A text frame is delivered to the others as `{"type":"relay_msg","from":id,"data":"<text>"}`;
 *   a text frame of the form `{"to":id,"data":"..."}` goes to that peer only.
 * - A binary frame is delivered with the sender's id as a 4-byte big-endian prefix.
 * Spectators receive everything and may not send.
 */
export async function handleRelay(ws: WebSocket, ticket: GameTicketClaims, hub: RoomHub) {
  const peer: LocalPeer = { peerId: peerIdFor(ticket.seat, ticket.host), userId: ticket.sub, seat: ticket.seat, ws };
  const limiter = new FrameLimiter(60, 240);
  const spectator = ticket.seat < 0;

  const others = await hub.join(ticket.room, 'relay', peer);
  ws.send(JSON.stringify({ type: 'relay_hello', peer: peer.peerId, seat: peer.seat, host: ticket.host, peers: others }));
  await hub.broadcast(
    ticket.room,
    'relay',
    peer.peerId,
    JSON.stringify({ type: 'relay_peer_joined', peer: peer.peerId, seat: peer.seat, user: peer.userId })
  );
  void reportPeerJoined(ticket.room, ticket.sub);

  ws.on('message', async (raw, isBinary) => {
    if (spectator || !limiter.take()) return;
    const data = raw as Buffer;
    if (data.length > MAX_FRAME) return ws.close(1009, 'frame too large');

    if (isBinary) {
      const prefix = Buffer.alloc(4);
      prefix.writeUInt32BE(peer.peerId);
      await hub.broadcast(ticket.room, 'relay', peer.peerId, Buffer.concat([prefix, data]));
      return;
    }

    const text = data.toString();
    let target: number | undefined;
    let payload = text;
    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text) as { to?: unknown; data?: unknown };
        if (typeof parsed.to === 'number' && typeof parsed.data === 'string') {
          target = parsed.to;
          payload = parsed.data;
        }
      } catch {
        /* plain text that happens to start with a brace */
      }
    }
    const message = JSON.stringify({ type: 'relay_msg', from: peer.peerId, data: payload });
    if (target !== undefined) await hub.sendTo(ticket.room, 'relay', target, message);
    else await hub.broadcast(ticket.room, 'relay', peer.peerId, message);
  });

  ws.on('close', async () => {
    await hub.leave(ticket.room, 'relay', peer);
    await hub.broadcast(ticket.room, 'relay', peer.peerId, JSON.stringify({ type: 'relay_peer_left', peer: peer.peerId }));
    void reportPeerLeft(ticket.room, ticket.sub);
  });
}
