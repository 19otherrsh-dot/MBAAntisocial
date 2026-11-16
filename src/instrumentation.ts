import type { Instrumentation } from 'next';

/**
 * Server-side error reporting.
 *
 * Every uncaught error in a route, page, or proxy is written as one line of
 * JSON, which log drains (Vercel, Datadog, Logtail, CloudWatch) index without
 * configuration. To forward to an error tracker instead, send the same object
 * to its HTTP intake here — this is the single place to do it.
 */
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
};
