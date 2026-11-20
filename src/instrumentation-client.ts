/**
 * Browser-side error tracking, loaded only when `NEXT_PUBLIC_SENTRY_DSN` is
 * set. The SDK is fetched as a separate chunk after start-up, so deployments
 * without Sentry ship none of it and those with it do not delay first paint.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
        // No user details, cookies, bodies, or query strings — see sentry-options.ts.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
        },
        tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
        beforeSend(event) {
          if (event.request?.url) event.request.url = event.request.url.split('?')[0];
          return event;
        },
      });
    })
    .catch(() => {
      // Blocked by an extension or offline: the app works the same without it.
    });
}

export {};
