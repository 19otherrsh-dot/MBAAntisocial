import { existsSync } from 'node:fs';
import { z } from 'zod';

// Local runs read apps/realtime/.env; containers and hosts pass real env vars,
// which always win (loadEnvFile never overwrites what is already set).
if (existsSync('.env')) process.loadEnvFile('.env');

const schema = z.object({
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  /** Must match the web app's REALTIME_SECRET (or its AUTH_SECRET-derived fallback). */
  REALTIME_SECRET: z.string().min(16).optional(),
  AUTH_SECRET: z.string().min(16).optional(),
  INTERNAL_API_SECRET: z.string().min(16).optional(),
  /** Where the web app is reachable from this service, e.g. http://web:3000. */
  WEB_INTERNAL_URL: z.string().url().default('http://localhost:3000'),
  REDIS_URL: z.string().optional(),
  /** Comma-separated origins allowed to open sockets. Empty allows APP_URL only. */
  CORS_ORIGINS: z.string().default(''),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Scheduler
  CRON_SECRET: z.string().optional(),
  SCHEDULER_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  // Dedicated Godot servers
  GODOT_BIN: z.string().optional(),
  /** Where dedicated server packs live: never under a public folder. */
  GAME_SERVERS_DIR: z.string().default('../../game-servers'),
  GAME_SERVER_PORT_MIN: z.coerce.number().int().default(20000),
  GAME_SERVER_PORT_MAX: z.coerce.number().int().default(20200),
  GAME_SERVER_MAX_PROCESSES: z.coerce.number().int().default(20),
  GAME_SERVER_IDLE_SECONDS: z.coerce.number().int().default(120),

  // Discord bridge
  DISCORD_BOT_TOKEN: z.string().optional(),
});

const parsed = schema.parse(process.env);

const authSecret = parsed.AUTH_SECRET ?? '';
export const config = {
  ...parsed,
  realtimeSecret: parsed.REALTIME_SECRET ?? (authSecret ? `${authSecret}:realtime` : ''),
  internalSecret: parsed.INTERNAL_API_SECRET ?? (authSecret ? `${authSecret}:internal` : ''),
  corsOrigins: parsed.CORS_ORIGINS
    ? parsed.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [parsed.APP_URL],
};

if (!config.realtimeSecret || !config.internalSecret) {
  throw new Error('Set REALTIME_SECRET and INTERNAL_API_SECRET (or AUTH_SECRET to derive both).');
}
