import ExternalAccount, { type ExternalProvider } from '@/models/ExternalAccount';
import { decrypt, encrypt } from '../crypto';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface StoreInput extends TokenSet {
  userId: string;
  provider: ExternalProvider;
  accountId: string;
  accountEmail: string;
  accountName?: string;
  scopes?: string[];
}

/** Persists an OAuth connection, keeping the old refresh token if none was reissued. */
export async function storeConnection(input: StoreInput) {
  const update: Record<string, unknown> = {
    accountId: input.accountId,
    accountEmail: input.accountEmail,
    accountName: input.accountName ?? '',
    accessToken: encrypt(input.accessToken),
    expiresAt: input.expiresIn ? new Date(Date.now() + (input.expiresIn - 60) * 1000) : undefined,
    scopes: input.scopes ?? [],
  };
  if (input.refreshToken) update.refreshToken = encrypt(input.refreshToken);
  await ExternalAccount.updateOne(
    { user: input.userId, provider: input.provider },
    { $set: update },
    { upsert: true }
  );
}

export async function disconnect(userId: string, provider: ExternalProvider) {
  await ExternalAccount.deleteOne({ user: userId, provider });
}

export async function isConnected(userId: string, provider: ExternalProvider) {
  return Boolean(await ExternalAccount.exists({ user: userId, provider }));
}

/**
 * A valid access token, refreshing through `refresh` when the stored one has
 * expired. Returns null when the user never connected or the grant was revoked.
 */
export async function accessTokenFor(
  userId: string,
  provider: ExternalProvider,
  refresh: (refreshToken: string) => Promise<TokenSet>
): Promise<string | null> {
  const account = await ExternalAccount.findOne({ user: userId, provider }).select('+accessToken +refreshToken');
  if (!account) return null;

  if (account.expiresAt && account.expiresAt > new Date() && account.accessToken) {
    return decrypt(account.accessToken);
  }
  if (!account.refreshToken) return account.accessToken ? decrypt(account.accessToken) : null;

  try {
    const next = await refresh(decrypt(account.refreshToken));
    account.accessToken = encrypt(next.accessToken);
    if (next.refreshToken) account.refreshToken = encrypt(next.refreshToken);
    account.expiresAt = next.expiresIn ? new Date(Date.now() + (next.expiresIn - 60) * 1000) : undefined;
    await account.save();
    return next.accessToken;
  } catch (error) {
    console.error(`[oauth] refresh failed for ${provider}:`, error instanceof Error ? error.message : error);
    return null;
  }
}
