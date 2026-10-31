import { config } from './config.js';

/**
 * The realtime service's side of error reporting (see apps/web/src/server/report.ts):
 * a structured log line, and the same Slack/Discord webhook when configured,
 * with repeats muted for ten minutes per message.
 */
const lastSent = new Map<string, number>();
const QUIET_MS = 10 * 60_000;

export async function reportError(error: unknown, where: string): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'Error';
  const stack = error instanceof Error ? (error.stack ?? '').split('\n').slice(1, 6).map((line) => line.trim()) : [];
  const release = process.env.GIT_SHA ?? 'dev';
  console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), service: 'realtime', where, name, message, release, stack }));

  if (!config.ERROR_WEBHOOK_URL) return;
  const key = `${where}|${name}|${message}`;
  if (Date.now() - (lastSent.get(key) ?? 0) < QUIET_MS) return;
  lastSent.set(key, Date.now());
  const text = `🔴 realtime: ${name} at ${where}: ${message.slice(0, 300)}${stack[0] ? `\n${stack[0]}` : ''}\nrelease ${release.slice(0, 8)} · repeats muted for 10 min`;
  try {
    await fetch(config.ERROR_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(5000) });
  } catch (failure) {
    console.error('[report] could not deliver the error report:', failure instanceof Error ? failure.message : failure);
  }
}
