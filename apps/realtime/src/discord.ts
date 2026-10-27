import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import type { Bus } from './bus.js';

/**
 * Inbound half of the Discord bridge: a minimal Discord gateway client.
 *
 * It listens for messages in the Discord channels hub admins bridged inbound
 * and relays each one to the web app, which posts it into the linked hub
 * channel. Bots and webhooks are ignored, which is also what stops the
 * outbound webhook mirror from echoing back.
 *
 * Only one realtime instance may hold the gateway connection, or every
 * message would arrive once per instance; a Redis lease decides who.
 */

const API = 'https://discord.com/api/v10';
const INTENTS = (1 << 0) | (1 << 9) | (1 << 15); // GUILDS | GUILD_MESSAGES | MESSAGE_CONTENT
const LEASE_KEY = 'mba:discord:gateway-leader';
const LEASE_SECONDS = 30;

interface GatewayPayload {
  op: number;
  d: unknown;
  s: number | null;
  t: string | null;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  webhook_id?: string;
  author: { id: string; username: string; global_name?: string; avatar?: string | null; bot?: boolean };
  attachments?: Array<{ url: string; filename: string; content_type?: string; size?: number }>;
}

async function internal<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(new URL(path, config.WEB_INTERNAL_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': config.internalSecret },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

class DiscordGateway {
  private ws: WebSocket | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private seq: number | null = null;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;
  private bridged = new Set<string>();
  private stopped = false;

  constructor(private readonly token: string) {}

  async start() {
    await this.refreshBridged();
    setInterval(() => void this.refreshBridged(), 60_000).unref();
    await this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ws?.close(1000);
  }

  private async refreshBridged() {
    try {
      const { channelIds } = await internal<{ channelIds: string[] }>('/api/internal/hub/discord-channels', {});
      this.bridged = new Set(channelIds);
    } catch (error) {
      console.error('[discord] could not load bridged channels:', (error as Error).message);
    }
  }

  private async connect(resume = false) {
    if (this.stopped) return;
    let url = this.resumeUrl;
    if (!resume || !url) {
      const res = await fetch(`${API}/gateway/bot`, { headers: { Authorization: `Bot ${this.token}` } });
      if (!res.ok) {
        console.error(`[discord] gateway lookup failed (${res.status}); retrying in 60s`);
        setTimeout(() => void this.connect(), 60_000).unref();
        return;
      }
      url = ((await res.json()) as { url: string }).url;
    }

    const ws = new WebSocket(`${url}/?v=10&encoding=json`);
    this.ws = ws;
    ws.on('message', (raw) => this.onPayload(JSON.parse(raw.toString()) as GatewayPayload, resume));
    ws.on('close', (code) => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      if (this.stopped) return;
      // 4004 bad token, 4013/4014 bad intents: do not hammer the gateway.
      if ([4004, 4013, 4014].includes(code)) {
        console.error(`[discord] gateway refused us (${code}). Check DISCORD_BOT_TOKEN and enable the Message Content intent.`);
        return;
      }
      setTimeout(() => void this.connect(Boolean(this.sessionId)), 2000 + Math.random() * 3000).unref();
    });
    ws.on('error', (error) => console.error('[discord] socket error:', error.message));
  }

  private send(op: number, d: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op, d }));
  }

  private onPayload(payload: GatewayPayload, resuming: boolean) {
    if (payload.s !== null) this.seq = payload.s;
    switch (payload.op) {
      case 10: {
        const interval = (payload.d as { heartbeat_interval: number }).heartbeat_interval;
        if (this.heartbeat) clearInterval(this.heartbeat);
        this.heartbeat = setInterval(() => this.send(1, this.seq), interval);
        if (resuming && this.sessionId) this.send(6, { token: this.token, session_id: this.sessionId, seq: this.seq });
        else this.send(2, { token: this.token, intents: INTENTS, properties: { os: 'linux', browser: 'mba-antisocial', device: 'mba-antisocial' } });
        break;
      }
      case 1:
        this.send(1, this.seq);
        break;
      case 7:
        this.ws?.close(4000);
        break;
      case 9:
        // Invalid session: start fresh.
        this.sessionId = null;
        this.ws?.close(4000);
        break;
      case 0:
        this.onDispatch(payload.t, payload.d);
        break;
    }
  }

  private onDispatch(type: string | null, data: unknown) {
    if (type === 'READY') {
      const ready = data as { session_id: string; resume_gateway_url: string; user: { username: string } };
      this.sessionId = ready.session_id;
      this.resumeUrl = ready.resume_gateway_url;
      console.info(`[discord] connected as ${ready.user.username}`);
      return;
    }
    if (type !== 'MESSAGE_CREATE') return;
    const message = data as DiscordMessage;
    if (!this.bridged.has(message.channel_id) || message.author.bot || message.webhook_id) return;
    if (!message.content && !message.attachments?.length) return;

    const avatar = message.author.avatar ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png?size=64` : '';
    void internal('/api/internal/hub/discord-inbound', {
      discordChannelId: message.channel_id,
      messageId: message.id,
      authorId: message.author.id,
      authorName: message.author.global_name || message.author.username,
      authorAvatar: avatar,
      content: message.content,
      attachments: (message.attachments ?? []).map((a) => ({ url: a.url, name: a.filename, contentType: a.content_type, size: a.size })),
    }).catch((error) => console.error('[discord] relay failed:', (error as Error).message));
  }
}

export async function startDiscordBridge(bus: Bus): Promise<void> {
  if (!config.DISCORD_BOT_TOKEN) return;
  const token = config.DISCORD_BOT_TOKEN;
  const me = randomUUID();
  let gateway: DiscordGateway | null = null;

  const tick = async () => {
    // Without Redis there is only one instance, so it leads.
    let leader = true;
    if (bus.redis) {
      const acquired = await bus.redis.set(LEASE_KEY, me, 'EX', LEASE_SECONDS, 'NX');
      const holder = acquired ? me : await bus.redis.get(LEASE_KEY);
      leader = holder === me;
      if (leader) await bus.redis.expire(LEASE_KEY, LEASE_SECONDS);
    }
    if (leader && !gateway) {
      gateway = new DiscordGateway(token);
      await gateway.start();
    } else if (!leader && gateway) {
      gateway.stop();
      gateway = null;
    }
  };

  await tick();
  setInterval(() => void tick().catch(() => undefined), (LEASE_SECONDS * 1000) / 3).unref();
}
