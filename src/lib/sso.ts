import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import type { Provider } from 'next-auth/providers';

/**
 * Single sign-on: "Continue with Google / Microsoft".
 *
 * Each provider is switched on by its own environment variables and nothing
 * else, so a campus on Google Workspace and one on Microsoft 365 can run the
 * same build. Adding another identity provider is one entry in `REGISTRY` — the
 * sign-in rules below do not change.
 */
interface ProviderEntry {
  id: string;
  label: string;
  enabled: () => boolean;
  build: () => Provider;
}

const REGISTRY: ProviderEntry[] = [
  {
    id: 'google',
    label: 'Google',
    enabled: () => Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    build: () => Google({ allowDangerousEmailAccountLinking: false }),
  },
  {
    id: 'microsoft-entra-id',
    label: 'Microsoft',
    enabled: () =>
      Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET),
    // With AUTH_MICROSOFT_ENTRA_ID_ISSUER set to the institute's tenant, only
    // that directory's accounts can sign in at all.
    build: () => MicrosoftEntraID({ issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER }),
  },
];

export function ssoProviders(): Provider[] {
  return REGISTRY.filter((entry) => entry.enabled()).map((entry) => entry.build());
}

export function enabledSsoProviders(): Array<{ id: string; label: string }> {
  return REGISTRY.filter((entry) => entry.enabled()).map(({ id, label }) => ({ id, label }));
}

export type SsoDecision =
  | { allow: true; action: 'link'; userId: string }
  | { allow: true; action: 'provision'; campus: string }
  | { allow: false; reason: 'unverified' | 'domain_not_bound' | 'suspended' | 'no_email' };

export interface SsoInput {
  provider: string;
  email: string | null | undefined;
  /** What the provider says about the address. Google reports it; Entra tenants vouch for theirs. */
  emailVerified: boolean;
  /** Campus the email's domain is bound to, if any. */
  boundCampus: string | null;
  existing: { id: string; suspended: boolean } | null;
}

/**
 * Whether an SSO sign-in may proceed, and what it does. Pure.
 *
 * - The address must be verified by the provider: linking an unverified
 *   address to an existing account would hand that account to whoever typed it.
 * - The domain must be bound to a campus (`CAMPUS_EMAIL_DOMAINS`). SSO is how an
 *   institute vouches for its people; an arbitrary Gmail account vouches for
 *   nothing about which campus it belongs to.
 * - An existing account with that address is linked, never duplicated.
 */
export function decideSsoSignIn(input: SsoInput): SsoDecision {
  if (!input.email) return { allow: false, reason: 'no_email' };
  if (!input.emailVerified) return { allow: false, reason: 'unverified' };
  if (!input.boundCampus) return { allow: false, reason: 'domain_not_bound' };
  if (input.existing?.suspended) return { allow: false, reason: 'suspended' };
  if (input.existing) return { allow: true, action: 'link', userId: input.existing.id };
  return { allow: true, action: 'provision', campus: input.boundCampus };
}

/** Whether the provider's profile vouches for the email address. */
export function providerVerifiedEmail(provider: string, profile: Record<string, unknown> | undefined): boolean {
  if (!profile) return false;
  if (provider === 'google') return profile.email_verified === true;
  // Entra ID addresses belong to the tenant directory; with the issuer pinned
  // to the institute's tenant they are the institute's own accounts.
  if (provider === 'microsoft-entra-id') return true;
  return false;
}
