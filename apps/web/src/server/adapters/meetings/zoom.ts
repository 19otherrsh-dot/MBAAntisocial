import type { ConnectableMeetingProvider, CreateMeetingInput, CreatedMeeting } from '../../ports/meetings';
import { accessTokenFor, isConnected, storeConnection, type TokenSet } from '../../modules/oauth-tokens';

const AUTH_URL = 'https://zoom.us/oauth/authorize';
const TOKEN_URL = 'https://zoom.us/oauth/token';
const API = 'https://api.zoom.us/v2';

/** Zoom via a user-level OAuth app: meetings are created on the mentor's own account. */
export class ZoomProvider implements ConnectableMeetingProvider {
  readonly id = 'zoom' as const;
  readonly label = 'Zoom';
  readonly configured = true;
  readonly requiresConnection = true;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  isReadyFor(hostUserId: string) {
    return isConnected(hostUserId, 'zoom');
  }

  authorizeUrl(state: string, redirectUri: string) {
    const params = new URLSearchParams({ response_type: 'code', client_id: this.clientId, redirect_uri: redirectUri, state });
    return `${AUTH_URL}?${params}`;
  }

  async completeConnection(hostUserId: string, code: string, redirectUri: string) {
    const tokens = await this.exchange({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const me = (await (await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } })).json()) as {
      id?: string;
      email?: string;
      display_name?: string;
    };
    await storeConnection({
      userId: hostUserId,
      provider: 'zoom',
      accountId: me.id ?? '',
      accountEmail: me.email ?? '',
      accountName: me.display_name ?? '',
      ...tokens,
    });
    return { accountEmail: me.email ?? '' };
  }

  async create(input: CreateMeetingInput): Promise<CreatedMeeting> {
    const token = await this.token(input.host.userId);
    const duration = Math.max(15, Math.round((input.endsAt.getTime() - input.startsAt.getTime()) / 60_000));
    const res = await fetch(`${API}/users/me/meetings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: input.title.slice(0, 200),
        type: 2,
        start_time: input.startsAt.toISOString(),
        duration,
        agenda: input.description.slice(0, 2000),
        settings: { join_before_host: false, waiting_room: true, mute_upon_entry: false, auto_recording: 'none' },
      }),
    });
    if (!res.ok) throw new Error(`Zoom rejected the meeting (${res.status}).`);
    const meeting = (await res.json()) as { id: number; join_url: string; start_url?: string };
    return { provider: this.id, joinUrl: meeting.join_url, externalId: String(meeting.id), hostUrl: meeting.start_url ?? null };
  }

  async cancel(hostUserId: string, externalId: string) {
    const token = await this.token(hostUserId);
    const res = await fetch(`${API}/meetings/${encodeURIComponent(externalId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`Zoom refused the cancellation (${res.status}).`);
  }

  private async token(userId: string) {
    const token = await accessTokenFor(userId, 'zoom', (refresh_token) =>
      this.exchange({ grant_type: 'refresh_token', refresh_token })
    );
    if (!token) throw new Error('Reconnect Zoom to create meeting links.');
    return token;
  }

  private async exchange(params: Record<string, string>): Promise<TokenSet> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams(params),
    });
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; reason?: string };
    if (!res.ok || !json.access_token) throw new Error(`Zoom token exchange failed: ${json.reason ?? res.status}`);
    return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
  }
}
