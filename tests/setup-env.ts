/**
 * Environment for the test run, set before any application module loads —
 * `src/lib/env.ts` validates `process.env` at import time.
 *
 * Integration tests use `TEST_MONGODB_URI` (a throwaway database; it is
 * dropped) and are skipped when it is unset, so `npm test` works on a laptop
 * with no database and runs the full suite in CI.
 */
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/mba-antisocial-test-unused';
process.env.AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123';
process.env.APP_TIME_ZONE = 'Asia/Kolkata';
process.env.CAMPUS_EMAIL_DOMAINS = 'iima.ac.in=IIM Ahmedabad,iimb.ac.in=IIM Bangalore';
// Realtime and email stay unconfigured: tests must not depend on either.
delete process.env.PUSHER_APP_ID;
delete process.env.RESEND_API_KEY;
