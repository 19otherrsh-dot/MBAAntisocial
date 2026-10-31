import { createHash } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Server error reporting without a vendor SDK: one structured log line per
 * error (searchable in any log drain), and, when ERROR_WEBHOOK_URL is set, a
 * short message to a Slack or Discord incoming webhook. The same error on the
 * same route is announced at most once every ten minutes. Nothing from request
 * bodies or the signed-in user is included.
 */
export interface ErrorContext {
  /** Where it happened: "GET /api/today", "render /hub". */
  where: string;
  digest?: string;
}

const QUIET_SECONDS = 600;

export async function reportError(error: unknown, context: ErrorContext): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'Error';
  const stack = error instanceof Error ? (error.stack ?? '').split('\n').slice(1, 6).map((line) => line.trim()) : [];
  const release = process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
  console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), where: context.where, name, message, digest: context.digest, release, stack }));

  if (!env.ERROR_WEBHOOK_URL) return;
  try {
    const fingerprint = createHash('sha1').update(`${context.where}|${name}|${message}`).digest('hex').slice(0, 16);
    const { container } = await import('@/server/container');
    if (!(await container().kv.setIfAbsent(`err:${fingerprint}`, '1', QUIET_SECONDS))) return;
    const text = `🔴 ${name} at ${context.where}: ${message.slice(0, 300)}${stack[0] ? `\n${stack[0]}` : ''}\nrelease ${release.slice(0, 8)} · repeats muted for 10 min`;
    // Slack reads `text`, Discord reads `content`.
    await fetch(env.ERROR_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(5000) });
  } catch (reportFailure) {
    console.error('[report] could not deliver the error report:', reportFailure instanceof Error ? reportFailure.message : reportFailure);
  }
}
