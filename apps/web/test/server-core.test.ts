import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKeyValueStore } from '@/server/adapters/kv/memory';
import { overrideContainer, resetContainer } from '@/server/container';
import { consume, RATE_LIMITS } from '@/lib/api/rate-limit';
import { decrypt, encrypt, hashToken, numericCode, safeEqual, signState, verifyState } from '@/server/crypto';

describe('memory key-value store', () => {
  it('setIfAbsent only succeeds once per key', async () => {
    const kv = new MemoryKeyValueStore();
    expect(await kv.setIfAbsent('k', '1', 60)).toBe(true);
    expect(await kv.setIfAbsent('k', '2', 60)).toBe(false);
    expect(await kv.get('k')).toBe('1');
  });

  it('take reads and removes in one step', async () => {
    const kv = new MemoryKeyValueStore();
    await kv.set('code', 'abc', 60);
    expect(await kv.take('code')).toBe('abc');
    expect(await kv.take('code')).toBeNull();
  });

  it('incr counts within a window', async () => {
    const kv = new MemoryKeyValueStore();
    expect((await kv.incr('n', 60)).value).toBe(1);
    expect((await kv.incr('n', 60)).value).toBe(2);
  });
});

describe('rate limiter', () => {
  afterEach(() => resetContainer());

  it('throws 429 once the window is exhausted, per identifier', async () => {
    overrideContainer({ kv: new MemoryKeyValueStore() });
    const { limit } = RATE_LIMITS.otp;
    for (let i = 0; i < limit; i++) await consume('otp', 'a@iima.ac.in');
    await expect(consume('otp', 'a@iima.ac.in')).rejects.toMatchObject({ status: 429 });
    await expect(consume('otp', 'b@iima.ac.in')).resolves.toBeUndefined();
  });

  it('fails open when the store is down', async () => {
    const broken = new MemoryKeyValueStore();
    broken.incr = async () => {
      throw new Error('down');
    };
    overrideContainer({ kv: broken });
    await expect(consume('write', 'x')).resolves.toBeUndefined();
  });
});

describe('crypto helpers', () => {
  it('encrypt/decrypt round-trips and is randomised', () => {
    const a = encrypt('refresh-token');
    expect(a).not.toBe(encrypt('refresh-token'));
    expect(decrypt(a)).toBe('refresh-token');
  });

  it('rejects tampered ciphertext', () => {
    const sealed = encrypt('secret');
    const flipped = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(() => decrypt(flipped)).toThrow();
  });

  it('signed state verifies and rejects tampering', () => {
    const state = signState({ userId: 'u1', provider: 'zoom' });
    expect(verifyState<{ userId: string }>(state)?.userId).toBe('u1');
    expect(verifyState(state.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')))).toBeNull();
  });

  it('hashes and compares tokens safely', () => {
    expect(hashToken('t')).toBe(hashToken('t'));
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(numericCode()).toMatch(/^\d{6}$/);
  });
});
