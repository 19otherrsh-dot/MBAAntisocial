import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authConfig } from '@/lib/auth.config';
import { hashToken, issueToken } from '@/lib/tokens';

type JwtParams = Parameters<typeof authConfig.callbacks.jwt>[0];

const baseToken = {
  id: 'u1',
  campus: 'IIM Ahmedabad',
  batch: '2025-27',
  year: 1 as const,
  role: 'student' as const,
  onboardedAt: null,
  authAt: 1,
};

test('a session update cannot set role or campus from the client', () => {
  // The escalation: POST /api/auth/session { data: { role: "admin" } }.
  const token = authConfig.callbacks.jwt({
    token: { ...baseToken },
    trigger: 'update',
    session: { role: 'admin', campus: 'IIM Bangalore', year: 2 },
  } as unknown as JwtParams);

  assert.equal((token as typeof baseToken).role, 'student');
  assert.equal((token as typeof baseToken).campus, 'IIM Ahmedabad');
  assert.equal((token as typeof baseToken).year, 1);
});

test('sign-in copies identity from the authorised user', () => {
  const token = authConfig.callbacks.jwt({
    token: {},
    user: { id: 'u2', campus: 'IIM Ahmedabad', batch: '2024-26', year: 2, role: 'mentor', onboardedAt: null },
  } as unknown as JwtParams) as typeof baseToken;
  assert.equal(token.role, 'mentor');
  assert.ok(token.authAt > 0);
});

test('emailed tokens: only the hash is stored, and it is not the token', () => {
  const issued = issueToken(60_000);
  assert.equal(issued.tokenHash, hashToken(issued.raw));
  assert.notEqual(issued.tokenHash, issued.raw);
  assert.ok(issued.raw.length >= 40);
  assert.notEqual(issueToken(60_000).raw, issued.raw);
});
