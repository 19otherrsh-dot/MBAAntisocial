import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { SIGNAL } from '@mba/shared/games';
import type { GameTicketClaims } from '@mba/shared/realtime';

process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret';
delete process.env.REDIS_URL;

let server: Server;
let port = 0;

beforeAll(async () => {
  const { createBus } = await import('../bus.js');
  const { RoomHub } = await import('../games/room-hub.js');
  const { handleSignaling } = await import('../games/signaling.js');
  const { handleRelay } = await import('../games/relay.js');
  const hub = new RoomHub(createBus());
  const wss = new WebSocketServer({ noServer: true });
  server = createServer();
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const ticket = JSON.parse(decodeURIComponent(url.searchParams.get('t') ?? '{}')) as GameTicketClaims;
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (url.pathname === '/signal') handleSignaling(ws, ticket, hub);
      else void handleRelay(ws, ticket, hub);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => server.close());

function ticket(sub: string, seat: number, host: boolean, transport: 'webrtc' | 'relay'): GameTicketClaims {
  return { sub, name: sub, room: 'room1', game: 'chess', seat, host, transport, use: 'game' };
}

function connect(path: string, t: GameTicketClaims) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}?t=${encodeURIComponent(JSON.stringify(t))}`);
  const inbox: string[] = [];
  const waiters: Array<() => void> = [];
  ws.on('message', (d) => {
    inbox.push(d.toString());
    waiters.splice(0).forEach((w) => w());
  });
  const next = async (predicate: (m: string) => boolean) => {
    for (let i = 0; i < 50; i += 1) {
      const found = inbox.find(predicate);
      if (found) return found;
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 50);
      });
    }
    throw new Error('timeout');
  };
  return { ws, inbox, next, opened: new Promise((r) => ws.on('open', r)) };
}

describe('webrtc signaling (Godot demo protocol)', () => {
  it('assigns ids, announces peers, and relays offers with the sender id', async () => {
    const host = connect('/signal', ticket('alice', 0, true, 'webrtc'));
    await host.opened;
    host.ws.send(JSON.stringify({ type: SIGNAL.JOIN, id: 0, data: 'whatever' }));
    const id = JSON.parse(await host.next((m) => JSON.parse(m).type === SIGNAL.ID));
    expect(id.id).toBe(1);
    expect(id.data).toBe('true');

    const guest = connect('/signal', ticket('bob', 1, false, 'webrtc'));
    await guest.opened;
    guest.ws.send(JSON.stringify({ type: SIGNAL.JOIN, id: 0, data: '' }));
    const gid = JSON.parse(await guest.next((m) => JSON.parse(m).type === SIGNAL.ID));
    expect(gid.id).toBe(3);
    const gpeer = JSON.parse(await guest.next((m) => JSON.parse(m).type === SIGNAL.PEER_CONNECT));
    expect(gpeer.id).toBe(1);
    const hpeer = JSON.parse(await host.next((m) => JSON.parse(m).type === SIGNAL.PEER_CONNECT));
    expect(hpeer.id).toBe(3);
    const lobby = JSON.parse(await guest.next((m) => JSON.parse(m).type === SIGNAL.JOIN));
    expect(lobby.data).toBe('room1');

    host.ws.send(JSON.stringify({ type: SIGNAL.OFFER, id: 3, data: 'sdp-offer' }));
    const offer = JSON.parse(await guest.next((m) => JSON.parse(m).type === SIGNAL.OFFER));
    expect(offer).toEqual({ type: SIGNAL.OFFER, id: 1, data: 'sdp-offer' });

    guest.ws.close();
    const left = JSON.parse(await host.next((m) => JSON.parse(m).type === SIGNAL.PEER_DISCONNECT));
    expect(left.id).toBe(3);
    host.ws.close();
  });
});

describe('relay', () => {
  it('greets, announces, and fans out frames tagged with the sender', async () => {
    const a = connect('/relay', ticket('alice', 0, true, 'relay'));
    const hello = JSON.parse(await a.next((m) => m.includes('relay_hello')));
    expect(hello.peer).toBe(1);
    const b = connect('/relay', ticket('bob', 1, false, 'relay'));
    await b.next((m) => m.includes('relay_hello'));
    await a.next((m) => m.includes('relay_peer_joined'));

    b.ws.send('move e2e4');
    const msg = JSON.parse(await a.next((m) => m.includes('relay_msg')));
    expect(msg).toEqual({ type: 'relay_msg', from: 3, data: 'move e2e4' });

    const spectator = connect('/relay', ticket('carol', -1, false, 'relay'));
    await spectator.next((m) => m.includes('relay_hello'));
    spectator.ws.send('cheating');
    a.ws.send(JSON.stringify({ to: 3, data: 'private' }));
    const priv = JSON.parse(await b.next((m) => m.includes('private')));
    expect(priv.from).toBe(1);
    await new Promise((r) => setTimeout(r, 100));
    expect(a.inbox.some((m) => m.includes('cheating'))).toBe(false);
    [a, b, spectator].forEach((c) => c.ws.close());
  });
});
