/**
 * The one place the app reports an unexpected error. Logs one JSON line (for
 * any log drain) and forwards to Sentry when it is configured. Code elsewhere
 * calls this and never imports an error tracker directly, so swapping or
 * adding one touches this file only.
 */
export async function reportError(error: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(
    JSON.stringify({
      level: 'error',
      at: new Date().toISOString(),
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 8).join('\n'),
      ...context,
    })
  );
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(err, { extra: context });
  } catch {
    // The tracker is optional; its failure must never add a second error.
  }
}
