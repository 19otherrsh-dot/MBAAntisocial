import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A KV that remembers keys, standing in for Redis.
const keys = new Set<string>();
vi.mock('@/server/container', () => ({
  container: () => ({ kv: { setIfAbsent: async (key: string) => (keys.has(key) ? false : (keys.add(key), true)) } }),
}));

describe('server error reports', () => {
  const sent: Array<{ url: string; body: { text: string; content: string } }> = [];

  beforeEach(() => {
    keys.clear();
    sent.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response('ok');
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('posts to the webhook once, then mutes repeats of the same error', async () => {
    vi.stubEnv('ERROR_WEBHOOK_URL', 'https://hooks.example.com/abc');
    const { reportError } = await import('@/server/report');
    await reportError(new TypeError('cannot read properties of undefined'), { where: 'GET /api/today' });
    await reportError(new TypeError('cannot read properties of undefined'), { where: 'GET /api/today' });
    await reportError(new Error('something else'), { where: 'GET /api/today' });
    expect(sent).toHaveLength(2);
    expect(sent[0].url).toBe('https://hooks.example.com/abc');
    expect(sent[0].body.text).toContain('TypeError at GET /api/today: cannot read properties of undefined');
    expect(sent[0].body.content).toBe(sent[0].body.text);
  });

  it('only logs when no webhook is configured', async () => {
    const { reportError } = await import('@/server/report');
    await reportError(new Error('boom'), { where: 'render /hub' });
    expect(sent).toHaveLength(0);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"where":"render /hub"'));
  });
});
