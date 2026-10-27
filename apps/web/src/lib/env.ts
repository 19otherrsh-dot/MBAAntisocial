import { z } from 'zod';

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

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  allowedEmailDomains: raw.ALLOWED_EMAIL_DOMAINS.split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
} as const;

/** True when the address is eligible to register under the current policy. */
export function isEmailDomainAllowed(email: string): boolean {
  if (env.allowedEmailDomains.length === 0) return true;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return env.allowedEmailDomains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}
