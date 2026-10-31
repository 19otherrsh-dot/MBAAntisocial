import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { config } from './config.js';
import { reportError } from './report.js';
import { createBus } from './bus.js';
import { attachSockets } from './sockets.js';
import { verifyGameTicket } from './tokens.js';
import { RoomHub } from './games/room-hub.js';
import { handleSignaling } from './games/signaling.js';
import { handleRelay } from './games/relay.js';
import { DedicatedServerManager, handleDedicated } from './games/dedicated.js';
import { startScheduler } from './scheduler.js';
import { startDiscordBridge } from './discord.js';

const bus = createBus();
const hub = new RoomHub(bus);
const dedicated = new DedicatedServerManager();

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, redis: bus.shared, dedicatedServers: dedicated.enabled }));
    return;
  }
  res.writeHead(404).end();
});

attachSockets(server, bus);

/** Plain WebSockets for Godot builds, which speak WebSocket but not Socket.IO. */
const gameSockets = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
const GAME_PATHS = {
  '/games/signal': 'webrtc',
  '/games/relay': 'relay',
  '/games/dedicated': 'dedicated',
} as const;

server.on('upgrade', async (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const transport = GAME_PATHS[url.pathname as keyof typeof GAME_PATHS];
  if (!transport) return; // Socket.IO's own upgrade handler takes the rest.

  const ticket = await verifyGameTicket(url.searchParams.get('ticket') ?? '');
  if (!ticket || ticket.transport !== transport) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  gameSockets.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    if (transport === 'webrtc') handleSignaling(ws, ticket, hub);
    else if (transport === 'relay') void handleRelay(ws, ticket, hub);
    else void handleDedicated(ws, ticket, dedicated);
  });
});

server.listen(config.PORT, config.HOST, () => {
  console.info(`[realtime] listening on ${config.HOST}:${config.PORT} (redis: ${bus.shared ? 'yes' : 'no'})`);
});

startScheduler();
void startDiscordBridge(bus);

const shutdown = () => {
  dedicated.stopAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// A rejected promise nobody awaited is reported and survives; an uncaught exception
// leaves the process in an unknown state, so it is reported and the process exits
// (the container or process manager restarts it).
process.on('unhandledRejection', (reason) => void reportError(reason, 'unhandledRejection'));
process.on('uncaughtException', (error) => {
  void reportError(error, 'uncaughtException').finally(() => {
    dedicated.stopAll();
    process.exit(1);
  });
});
