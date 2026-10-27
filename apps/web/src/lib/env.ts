import { z } from 'zod';

/**
 * Validated environment. Importing this module fails fast at boot with a
 * readable message rather than surfacing `undefined` deep inside a request.
 *
 * Only the database and the session secret are required. Every integration is
 * optional: when its keys are absent the composition root (`server/container`)
 * wires a safe fallback adapter instead — a console mailer, local-disk storage,
 * a manual meeting link — so a fresh clone runs end to end with two variables.
 */
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .refine(
      (v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'),
      'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string'
    ),

  MONGODB_DB_NAME: z.string().min(1).optional(),

  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters. Generate one with: npx auth secret'),

  /** Public origin, used to build absolute meeting/callback URLs. */
  APP_URL: z.string().url().default('http://localhost:3000'),

  /**
   * Optional global allow-list on top of the campus registry, e.g. for a
   * closed pilot: "iima.ac.in,iimb.ac.in". Empty means the registry decides.
   */
  ALLOWED_EMAIL_DOMAINS: z.string().default(''),

  /** Comma-separated emails promoted to platform admin on sign-in. */
  PLATFORM_ADMIN_EMAILS: z.string().default(''),

  // ── Shared infrastructure ──
  REDIS_URL: optional,
  /** Signs realtime socket tokens and game tickets; shared with apps/realtime. */
  REALTIME_SECRET: optional,
  /** Public URL of apps/realtime, e.g. wss://rt.example.com. */
  NEXT_PUBLIC_REALTIME_URL: optional,
  /** Shared secret for service-to-service calls from apps/realtime. */
  INTERNAL_API_SECRET: optional,
  CRON_SECRET: optional,
  /** 32-byte key (base64 or hex) for encrypting stored OAuth tokens. Defaults to one derived from AUTH_SECRET. */
  ENCRYPTION_KEY: optional,

  // ── AI ──
  ANTHROPIC_API_KEY: optional,
  /** Model for every AI feature. Override per deployment if cost matters more than depth. */
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),

  // ── Email ──
  RESEND_API_KEY: optional,
  SMTP_URL: optional,
  EMAIL_FROM: z.string().default('MBAAntisocial <no-reply@mbaantisocial.app>'),

  // ── Storage ──
  CLOUDINARY_CLOUD_NAME: optional,
  CLOUDINARY_API_KEY: optional,
  CLOUDINARY_API_SECRET: optional,
  /** Directory for the disk storage fallback. */
  UPLOAD_DIR: z.string().default('.uploads'),

  // ── Push ──
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: z.string().default('mailto:support@mbaantisocial.app'),
  EXPO_ACCESS_TOKEN: optional,

  // ── Sign-in providers ──
  AUTH_GOOGLE_ID: optional,
  AUTH_GOOGLE_SECRET: optional,
  AUTH_MICROSOFT_ENTRA_ID_ID: optional,
  AUTH_MICROSOFT_ENTRA_ID_SECRET: optional,
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: optional,
  AUTH_LINKEDIN_ID: optional,
  AUTH_LINKEDIN_SECRET: optional,

  // ── Meetings ──
  /** Google Calendar API OAuth client for auto-generated Meet links. */
  GOOGLE_CALENDAR_CLIENT_ID: optional,
  GOOGLE_CALENDAR_CLIENT_SECRET: optional,
  ZOOM_CLIENT_ID: optional,
  ZOOM_CLIENT_SECRET: optional,
  /** Jitsi deployment for free rooms when a mentor has no link of their own. */
  JITSI_BASE_URL: z.string().url().default('https://meet.jit.si'),
  LIVEKIT_URL: optional,
  LIVEKIT_API_KEY: optional,
  LIVEKIT_API_SECRET: optional,

  // ── Discord bridge ──
  DISCORD_CLIENT_ID: optional,
  DISCORD_CLIENT_SECRET: optional,
  DISCORD_BOT_TOKEN: optional,

  // ── Games ──
  /** STUN/TURN for WebRTC games, JSON array of RTCIceServer. */
  GAME_ICE_SERVERS: optional,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid environment configuration.\n${issues}\n\nCopy .env.example to .env.local and fill in the values.`
  );
}

const raw = parsed.data;

const list = (value: string) =>
  value
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  allowedEmailDomains: list(raw.ALLOWED_EMAIL_DOMAINS),
  platformAdminEmails: list(raw.PLATFORM_ADMIN_EMAILS),
  /** Falls back to a value derived from AUTH_SECRET so dev needs no extra keys. */
  realtimeSecret: raw.REALTIME_SECRET ?? `${raw.AUTH_SECRET}:realtime`,
  internalApiSecret: raw.INTERNAL_API_SECRET ?? `${raw.AUTH_SECRET}:internal`,
} as const;

/**
 * True when the address passes the optional global allow-list. The campus
 * registry (`server/modules/campus`) is the real gate; this only narrows it.
 */
export function isEmailDomainAllowed(email: string): boolean {
  if (env.allowedEmailDomains.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return env.allowedEmailDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}
