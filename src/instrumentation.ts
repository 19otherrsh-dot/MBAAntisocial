import type { Instrumentation } from 'next';

/**
 * Server-side observability.
 *
 * `register` starts Sentry when `SENTRY_DSN` is set; without it nothing is
 * imported. `onRequestError` sees every uncaught error in a route, page, or
 * the proxy: it always writes one JSON log line, and also reports to Sentry
 * when configured.
 */
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    await import('./lib/observability/sentry.server');
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: 'error',
      at: new Date().toISOString(),
      message: err.message,
      digest: err.digest,
      stack: err.stack?.split('\n').slice(0, 8).join('\n'),
      method: request.method,
      // The path only: query strings can carry tokens (reset links).
      path: request.path.split('?')[0],
      routeType: context.routeType,
      routePath: context.routePath,
    })
  );

  if (process.env.SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureRequestError(error, { ...request, path: request.path.split('?')[0] }, context);
  }
};
