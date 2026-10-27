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
