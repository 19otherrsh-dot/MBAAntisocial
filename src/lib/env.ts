import { z } from 'zod';
import { CAMPUSES } from './constants';

/**
 * Validated environment. Importing this module fails fast at boot with a
 * readable message rather than surfacing `undefined` deep inside a request.
 */
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
   * Comma-separated email domains allowed to register, e.g. "iima.ac.in,iimb.ac.in".
   * Empty means open registration — appropriate for the Open Edition, but a
   * campus rollout should pin this so a batch stays a batch.
   */
  ALLOWED_EMAIL_DOMAINS: z.string().default(''),

  /**
   * Binds an email domain to the campus it proves membership of, as
   * comma-separated `domain=Campus` pairs:
   *
   *   CAMPUS_EMAIL_DOMAINS=iima.ac.in=IIM Ahmedabad,iimb.ac.in=IIM Bangalore
   *
   * Everything in the product is scoped by campus, so a campus the user simply
   * picks from a dropdown is not a boundary at all. Once a campus is listed
   * here, only its own addresses can register into it.
   */
  CAMPUS_EMAIL_DOMAINS: z.string().default(''),

  /** IANA zone the campus lives in. Days, streaks, and deadlines roll over here. */
  APP_TIME_ZONE: z.string().min(1).default('Asia/Kolkata'),

  /** Transactional email (verification, password reset, digest). Optional. */
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default('MBAAntisocial <noreply@mbaantisocial.com>'),

  /**
   * Whether a new account must confirm its address before signing in. Defaults
   * to on whenever email can actually be sent, and off otherwise — requiring a
   * link nobody can receive would lock every new account out.
   */
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).optional(),

  /** Gemini model id for the AI interviewer and resume roast. */
  GEMINI_MODEL: z.string().min(1).default('gemini-flash-latest'),

  /** Pusher, for realtime delivery. Optional: without it the app polls on load. */
  PUSHER_APP_ID: z.string().min(1).optional(),
  PUSHER_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_PUSHER_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_PUSHER_CLUSTER: z.string().min(1).optional(),
});

/** Treats `KEY=` in an env file the same as the key being absent. */
function withoutEmptyValues(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

const parsed = envSchema.safeParse(withoutEmptyValues(process.env));

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  throw new Error(
    `Invalid environment configuration.\n${issues}\n\nCopy .env.example to .env.local and fill in the values.`
  );
}

const raw = parsed.data;

function parseCampusDomains(value: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of value.split(',')) {
    const [domain, campus] = pair.split('=').map((part) => part?.trim());
    if (!domain || !campus) continue;
    if (!(CAMPUSES as readonly string[]).includes(campus)) {
      throw new Error(
        `CAMPUS_EMAIL_DOMAINS names "${campus}", which is not in the campus list in src/lib/constants.ts.`
      );
    }
    map.set(domain.toLowerCase(), campus);
  }
  return map;
}

const campusDomains = parseCampusDomains(raw.CAMPUS_EMAIL_DOMAINS);

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  allowedEmailDomains: raw.ALLOWED_EMAIL_DOMAINS.split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  campusDomains,
  emailConfigured: Boolean(raw.RESEND_API_KEY),
  requireEmailVerification:
    raw.REQUIRE_EMAIL_VERIFICATION !== undefined
      ? raw.REQUIRE_EMAIL_VERIFICATION === 'true'
      : Boolean(raw.RESEND_API_KEY),
  pusherConfigured: Boolean(
    raw.PUSHER_APP_ID && raw.PUSHER_SECRET && raw.NEXT_PUBLIC_PUSHER_KEY && raw.NEXT_PUBLIC_PUSHER_CLUSTER
  ),
} as const;

/** True when the address is eligible to register under the current policy. */
export function isEmailDomainAllowed(email: string): boolean {
  if (env.allowedEmailDomains.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return env.allowedEmailDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

function domainOf(email: string): string | null {
  return email.split('@')[1]?.toLowerCase() ?? null;
}

/** The campus an address proves membership of, or null when its domain is unbound. */
export function campusForEmail(email: string): string | null {
  const domain = domainOf(email);
  if (!domain) return null;
  for (const [bound, campus] of env.campusDomains) {
    if (domain === bound || domain.endsWith(`.${bound}`)) return campus;
  }
  return null;
}

/** True when at least one email domain has been bound to `campus`. */
export function isCampusBound(campus: string): boolean {
  for (const bound of env.campusDomains.values()) {
    if (bound === campus) return true;
  }
  return false;
}
