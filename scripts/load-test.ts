/**
 * Load test: signs in once as a seeded account, then drives the endpoints a
 * signed-in student hits most — the game HUD, their account, the feed, tasks,
 * notifications, standings — plus the health check and the home page.
 *
 *   npm run build && npm start         # in one terminal
 *   npm run seed                       # the demo campus, once
 *   npm run load-test                  # in another
 *
 * Settings, all optional:
 *   LOAD_URL           target              (default http://localhost:3000)
 *   LOAD_EMAIL         account to use      (default the seeded sneha@iima.ac.in)
 *   LOAD_PASSWORD      its password        (default the seed password)
 *   LOAD_CONNECTIONS   concurrent clients  (default 25)
 *   LOAD_SECONDS       per endpoint        (default 15)
 *   LOAD_P99_MS        p99 budget          (default 800)
 *
 * Exits non-zero when any endpoint returns errors or misses its p99 budget, so
 * it can gate a release. Only reads are exercised: writes are rate-limited per
 * user (that is the point of the limiter), so hammering them from one account
 * measures the limiter, not the app. Never point this at production without
 * telling whoever runs it.
 */
import autocannon from 'autocannon';

const BASE = (process.env.LOAD_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = process.env.LOAD_EMAIL ?? 'sneha@iima.ac.in';
const PASSWORD = process.env.LOAD_PASSWORD ?? 'seedpassword123';
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS ?? 25);
const SECONDS = Number(process.env.LOAD_SECONDS ?? 15);
const P99_BUDGET_MS = Number(process.env.LOAD_P99_MS ?? 800);

interface Target {
  name: string;
  path: string;
  /** Sent without the session — the health check is public. */
  anonymous?: boolean;
}

const TARGETS: Target[] = [
  { name: 'health', path: '/api/health', anonymous: true },
  { name: 'me', path: '/api/me' },
  { name: 'game', path: '/api/game' },
  { name: 'feed', path: '/api/feed' },
  { name: 'tasks', path: '/api/tasks' },
  { name: 'notifications', path: '/api/notifications' },
  { name: 'leaderboard', path: '/api/leaderboard' },
  { name: 'home page', path: '/home' },
];

/** Collects `name=value` pairs from Set-Cookie headers into a Cookie header. */
function cookieJar(responses: Response[]): string {
  const jar = new Map<string, string>();
  for (const response of responses) {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function signIn(): Promise<string> {
  const csrf = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const callback = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookieJar([csrf]) },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD }),
  });
  const cookie = cookieJar([csrf, callback]);
  if (!/session-token=/.test(cookie)) {
    throw new Error(`Sign-in failed for ${EMAIL} (HTTP ${callback.status}). Is the campus seeded?`);
  }
  return cookie;
}

interface Row {
  name: string;
  requests: number;
  rps: number;
  p50: number;
  p99: number;
  errors: number;
  ok: boolean;
}

async function run(target: Target, cookie: string): Promise<Row> {
  const result = await autocannon({
    url: `${BASE}${target.path}`,
    connections: CONNECTIONS,
    duration: SECONDS,
    headers: target.anonymous ? {} : { cookie, accept: 'application/json' },
  });
  // Non-2xx (a 401 from a lost session, a 429, a 500) counts as an error too.
  const errors = result.errors + result.timeouts + result.non2xx;
  return {
    name: target.name,
    requests: result.requests.total,
    rps: Math.round(result.requests.average),
    p50: result.latency.p50,
    p99: result.latency.p99,
    errors,
    ok: errors === 0 && result.latency.p99 <= P99_BUDGET_MS,
  };
}

async function main() {
  console.log(`Load test → ${BASE}  (${CONNECTIONS} connections × ${SECONDS}s per endpoint, p99 budget ${P99_BUDGET_MS}ms)\n`);
  const cookie = await signIn();

  const rows: Row[] = [];
  for (const target of TARGETS) {
    process.stdout.write(`  ${target.name.padEnd(14)}`);
    const row = await run(target, cookie);
    rows.push(row);
    console.log(
      `${String(row.rps).padStart(6)} req/s   p50 ${String(row.p50).padStart(4)}ms   p99 ${String(row.p99).padStart(5)}ms   ` +
        `errors ${row.errors}   ${row.ok ? 'ok' : 'FAIL'}`
    );
  }

  const failed = rows.filter((row) => !row.ok);
  console.log(failed.length === 0 ? '\nAll endpoints within budget.' : `\n${failed.length} endpoint(s) over budget or erroring.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
