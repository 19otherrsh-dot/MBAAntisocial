/**
 * Domain vocabulary lives in `@mba/shared` so the web app, the realtime server,
 * and the native app read one definition. This re-export keeps every existing
 * `@/lib/constants` import working.
 */
export * from '@mba/shared/constants';
