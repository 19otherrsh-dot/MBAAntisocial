/**
 * Boot hook. On the Node runtime only: make sure the campus registry has its
 * starter directory, so the first sign-up on a fresh database resolves IIM-A
 * and friends without an admin having to seed anything.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  try {
    const { default: connectDB } = await import('./lib/mongodb');
    const { ensureCampusDirectory } = await import('./server/modules/campus/service');
    await connectDB();
    await ensureCampusDirectory();
  } catch (error) {
    console.error('[boot] campus directory check failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Errors Next.js catches itself (a page or layout that threw while rendering).
 * API routes report from their own error handler (lib/api/errors.ts).
 */
export async function onRequestError(error: unknown, request: { path: string; method: string }, context: { routerKind: string; routePath: string; routeType: string }) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportError } = await import('./server/report');
  const digest = typeof error === 'object' && error !== null && 'digest' in error ? String((error as { digest: unknown }).digest) : undefined;
  await reportError(error, { where: `${context.routeType} ${request.method} ${context.routePath}`, digest });
}
