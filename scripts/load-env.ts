/**
 * Loads environment files for scripts run outside Next.js.
 *
 * Next reads `.env.local` itself; a plain `tsx` script does not, and
 * `dotenv/config` only reads `.env`. The README tells people to put their
 * settings in `.env.local`, so `npm run seed` failed on a fresh setup with
 * "MONGODB_URI is required". This mirrors Next's precedence: `.env.local`
 * wins, `.env` fills gaps, and anything already exported in the shell beats
 * both.
 *
 * Imported first, as a side effect, so it runs before `src/lib/env.ts`
 * validates `process.env` at import time.
 */
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });
