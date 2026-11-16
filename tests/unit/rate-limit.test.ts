import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { consume } from '@/lib/api/rate-limit';
import { ApiError } from '@/lib/api/errors';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

test('local limiter allows the limit, then refuses with a retry time', async () => {
  const id = `local-${Math.random()}`;
  for (let i = 0; i < 5; i += 1) await consume('register', id);
  await assert.rejects(consume('register', id), (error: unknown) => {
    return error instanceof ApiError && error.status === 429 && /Try again in/.test(error.message);
  });
});

test('with a shared store configured, its counter decides', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  const calls: string[] = [];
  let count = 0;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push(String(url));
    assert.match(String(init?.headers && (init.headers as Record<string, string>).Authorization), /^Bearer token$/);
    count += 1;
    return new Response(JSON.stringify([{ result: count === 1 ? 999 : 1 }, { result: 1 }]));
  }) as typeof fetch;

  // The store reports 999 hits: refused, even though this process has seen one.
  await assert.rejects(consume('register', 'shared-user'), ApiError);
  assert.equal(calls[0], 'https://example.upstash.io/pipeline');
  // The store reports 1 hit: allowed.
  await consume('register', 'shared-user');
});

test('an unreachable shared store falls back to counting locally', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await consume('register', `fallback-${Math.random()}`);
  } finally {
    console.warn = originalWarn;
  }
});
