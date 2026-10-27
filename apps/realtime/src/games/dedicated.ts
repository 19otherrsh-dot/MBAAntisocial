import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { GameTicketClaims } from '@mba/shared/realtime';
import { config } from '../config.js';
import { mintServerToken } from '../tokens.js';
import { dedicatedRoomInfo, reportPeerJoined, reportPeerLeft } from '../web.js';

/**
 * Headless Godot servers, one per room, started on the first connection and
 * stopped once the room has been empty for a while.
 *
 * The game's own server build is launched as:
 *
 *   godot --headless --main-pack <server.pck> -- \
 *     --port=<p> --room=<roomId> --max-players=<n> \
 *     --report-url=<APP_URL>/api/games/server-report --verify-url=<APP_URL>/api/games/verify-ticket \
 *     --server-token=<jwt>
 *
 * and is expected to `WebSocketMultiplayerPeer.create_server(port)` on
 * 127.0.0.1. Players never reach it directly: they connect here with a signed
 * ticket and frames are piped through, so the process needs no public port
 * and no authentication of its own beyond verifying tickets the SDK forwards.
 */
interface ManagedServer {
  roomId: string;
  port: number;
  process: ChildProcess;
  connections: number;
  idleTimer: NodeJS.Timeout | null;
  ready: Promise<void>;
}

export class DedicatedServerManager {
  private readonly servers = new Map<string, ManagedServer>();
  private readonly usedPorts = new Set<number>();

  get enabled(): boolean {
    return Boolean(config.GODOT_BIN);
  }

  private allocatePort(): number | null {
    for (let p = config.GAME_SERVER_PORT_MIN; p <= config.GAME_SERVER_PORT_MAX; p += 1) {
      if (!this.usedPorts.has(p)) {
        this.usedPorts.add(p);
        return p;
      }
    }
    return null;
  }

  /** Resolves a manifest-relative pack path, refusing anything outside the assets dir. */
  private packPath(relative: string): string | null {
    const root = path.resolve(process.cwd(), config.GAME_ASSETS_DIR);
    const full = path.resolve(root, relative.replace(/^\/?games\//, ''));
    return full.startsWith(root + path.sep) && full.endsWith('.pck') ? full : null;
  }

  async ensure(roomId: string): Promise<ManagedServer> {
    const existing = this.servers.get(roomId);
    if (existing) return existing;
    if (!this.enabled) throw new Error('Dedicated game servers are not configured (GODOT_BIN).');
    if (this.servers.size >= config.GAME_SERVER_MAX_PROCESSES) throw new Error('All game servers are busy. Try again shortly.');

    const info = await dedicatedRoomInfo(roomId);
    if (!info || !info.serverPack) throw new Error('This room has no dedicated server build.');
    const pack = this.packPath(info.serverPack);
    if (!pack) throw new Error('Server pack path is invalid.');
    const port = this.allocatePort();
    if (port === null) throw new Error('No free game-server ports.');

    const serverToken = await mintServerToken(roomId);
    const child = spawn(
      config.GODOT_BIN!,
      [
        '--headless',
        '--main-pack',
        pack,
        '--',
        `--port=${port}`,
        `--room=${roomId}`,
        `--max-players=${info.maxPlayers}`,
        `--report-url=${config.APP_URL}/api/games/server-report`,
        `--verify-url=${config.APP_URL}/api/games/verify-ticket`,
        `--server-token=${serverToken}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ANTISOCIAL_ROOM: roomId } }
    );
    child.stdout?.on('data', (d) => process.stdout.write(`[godot:${roomId.slice(-6)}] ${d}`));
    child.stderr?.on('data', (d) => process.stderr.write(`[godot:${roomId.slice(-6)}] ${d}`));

    const server: ManagedServer = {
      roomId,
      port,
      process: child,
      connections: 0,
      idleTimer: null,
      ready: waitForPort(port, 15_000),
    };
    child.on('exit', (code) => {
      console.info(`[games] server for ${roomId} exited (${code})`);
      this.servers.delete(roomId);
      this.usedPorts.delete(port);
    });
    this.servers.set(roomId, server);
    await server.ready;
    return server;
  }

  attach(server: ManagedServer) {
    server.connections += 1;
    if (server.idleTimer) clearTimeout(server.idleTimer);
    server.idleTimer = null;
  }

  detach(server: ManagedServer) {
    server.connections = Math.max(0, server.connections - 1);
    if (server.connections === 0) {
      server.idleTimer = setTimeout(() => this.stop(server.roomId), config.GAME_SERVER_IDLE_SECONDS * 1000);
    }
  }

  stop(roomId: string) {
    const server = this.servers.get(roomId);
    if (!server) return;
    server.process.kill('SIGTERM');
    setTimeout(() => server.process.kill('SIGKILL'), 5000).unref();
  }

  stopAll() {
    for (const roomId of this.servers.keys()) this.stop(roomId);
  }
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error('Game server did not start in time.'));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

/** Pipes a player's socket to the room's Godot server, both directions, frame for frame. */
export async function handleDedicated(ws: WebSocket, ticket: GameTicketClaims, manager: DedicatedServerManager) {
  let server: ManagedServer;
  try {
    server = await manager.ensure(ticket.room);
  } catch (error) {
    ws.close(1011, (error as Error).message.slice(0, 120));
    return;
  }

  const upstream = new WebSocket(`ws://127.0.0.1:${server.port}`);
  upstream.binaryType = 'nodebuffer';
  manager.attach(server);
  const pending: Array<{ data: Buffer; binary: boolean }> = [];

  upstream.on('open', () => {
    for (const msg of pending.splice(0)) upstream.send(msg.data, { binary: msg.binary });
    void reportPeerJoined(ticket.room, ticket.sub);
  });
  upstream.on('message', (data, binary) => {
    if (ws.readyState === ws.OPEN) ws.send(data as Buffer, { binary });
  });
  ws.on('message', (data, binary) => {
    const buf = data as Buffer;
    if (upstream.readyState === upstream.OPEN) upstream.send(buf, { binary });
    else if (pending.length < 100) pending.push({ data: buf, binary });
  });

  const close = () => {
    if (upstream.readyState === upstream.OPEN || upstream.readyState === upstream.CONNECTING) upstream.close();
    if (ws.readyState === ws.OPEN) ws.close();
  };
  let detached = false;
  const detach = () => {
    if (detached) return;
    detached = true;
    manager.detach(server);
    void reportPeerLeft(ticket.room, ticket.sub);
  };
  upstream.on('close', () => {
    close();
    detach();
  });
  upstream.on('error', () => close());
  ws.on('close', () => {
    close();
    detach();
  });
}
