import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideSsoSignIn, providerVerifiedEmail } from '@/lib/sso';

const base = {
  provider: 'google',
  email: 'asha@iima.ac.in',
  emailVerified: true,
  boundCampus: 'IIM Ahmedabad',
  existing: null,
};

test('a verified institute address with no account is provisioned into its campus', () => {
  assert.deepEqual(decideSsoSignIn(base), { allow: true, action: 'provision', campus: 'IIM Ahmedabad' });
});

test('an existing account is linked, never duplicated', () => {
  assert.deepEqual(decideSsoSignIn({ ...base, existing: { id: 'u1', suspended: false } }), {
    allow: true,
    action: 'link',
    userId: 'u1',
  });
});

test('refusals: unverified, unbound domain, suspended, no email', () => {
  assert.deepEqual(decideSsoSignIn({ ...base, emailVerified: false }), { allow: false, reason: 'unverified' });
  assert.deepEqual(decideSsoSignIn({ ...base, email: 'x@gmail.com', boundCampus: null }), {
    allow: false,
    reason: 'domain_not_bound',
  });
  assert.deepEqual(decideSsoSignIn({ ...base, existing: { id: 'u1', suspended: true } }), {
    allow: false,
    reason: 'suspended',
  });
  assert.deepEqual(decideSsoSignIn({ ...base, email: null }), { allow: false, reason: 'no_email' });
});

test('an unverified address can never take over an existing account', () => {
  const decision = decideSsoSignIn({ ...base, emailVerified: false, existing: { id: 'victim', suspended: false } });
  assert.equal(decision.allow, false);
});

test('which providers vouch for an email', () => {
  assert.equal(providerVerifiedEmail('google', { email_verified: true }), true);
  assert.equal(providerVerifiedEmail('google', { email_verified: false }), false);
  assert.equal(providerVerifiedEmail('google', {}), false);
  assert.equal(providerVerifiedEmail('microsoft-entra-id', { email: 'a@b' }), true);
  assert.equal(providerVerifiedEmail('github', { email: 'a@b' }), false);
  assert.equal(providerVerifiedEmail('google', undefined), false);
});
