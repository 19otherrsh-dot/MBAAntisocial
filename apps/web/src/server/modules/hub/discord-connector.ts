import { env } from '@/lib/env';
import type { IntegrationConnector } from '../integrations/registry';
import { storeConnection } from '../oauth-tokens';

/**
 * Links a member's Discord account (identify scope only), so messages they
 * send in a bridged Discord channel are attributed to them in the hub.
 */
export function discordConnector(): IntegrationConnector | null {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) return null;
  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  return {
    provider: 'discord',
    label: 'Discord',
    description: 'Messages you send in bridged Discord channels show up as you in the hub.',
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'identify', state, prompt: 'none' });
      return `https://discord.com/oauth2/authorize?${params}`;
    },
    async complete(userId, code, redirectUri) {
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      });
      const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
      if (!tokens.access_token) throw new Error('Discord token exchange failed');
      const me = (await (await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json()) as {
        id: string;
        username: string;
        global_name?: string;
      };
      await storeConnection({
        userId,
        provider: 'discord',
        accountId: me.id,
        accountEmail: me.username,
        accountName: me.global_name ?? me.username,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        scopes: ['identify'],
      });
      return { accountEmail: `@${me.username}` };
    },
  };
}
