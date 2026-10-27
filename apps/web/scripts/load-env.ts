import { config } from 'dotenv';

/**
 * Scripts run outside Next, which is what normally loads `.env.local`. Load it
 * the same way Next does — `.env.local` first, `.env` as the fallback — before
 * anything imports `src/lib/env`.
 */
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });
