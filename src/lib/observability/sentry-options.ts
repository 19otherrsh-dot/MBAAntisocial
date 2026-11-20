/**
 * Shared Sentry options. Error tracking is switched on by `SENTRY_DSN` (server)
 * and `NEXT_PUBLIC_SENTRY_DSN` (browser); with neither set, nothing is loaded.
 *
 * Privacy: no user details, cookies, bodies, or query strings. A crash report
 * must not become a copy of someone's pipeline.
 */
/**
 * What the SDK may collect. Sentry's defaults collect cookies, headers, request
 * bodies, query strings, and user details; every one of those can carry a
 * student's private data or a one-time token, so each is switched off or
 * narrowed to what diagnosing a crash actually needs.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ['user-agent', 'content-type', 'accept-language'] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
} as const;

export function sentryOptions(dsn: string) {
  return {
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
    dataCollection: { ...DATA_COLLECTION, httpHeaders: { ...DATA_COLLECTION.httpHeaders, request: { allow: [...DATA_COLLECTION.httpHeaders.request.allow] } }, httpBodies: [] },
    // A sample of traces is enough to see slow routes without paying for all of them.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  };
}

/** Strips query strings, which can carry one-time tokens (reset links). */
export function scrubUrl(url: string | undefined): string | undefined {
  return url?.split('?')[0];
}
