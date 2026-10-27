import type { ConnectableMeetingProvider, CreateMeetingInput, CreatedMeeting } from '../../ports/meetings';
import { accessTokenFor, isConnected, storeConnection, type TokenSet } from '../../modules/oauth-tokens';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];

/**
 * Google Meet via the Calendar API: booking a slot creates an event on the
 * mentor's calendar with a Meet conference attached, and invites the mentee.
 * Requires the mentor to connect their Google account once.
 */
export class GoogleMeetProvider implements ConnectableMeetingProvider {
  readonly id = 'google_meet' as const;
  readonly label = 'Google Meet';
  readonly configured = true;
  readonly requiresConnection = true;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  isReadyFor(hostUserId: string) {
    return isConnected(hostUserId, 'google_calendar');
  }

  authorizeUrl(state: string, redirectUri: string) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `${AUTH_URL}?${params}`;
  }

  async completeConnection(hostUserId: string, code: string, redirectUri: string) {
    const tokens = await this.exchange({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const info = (await (
      await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.accessToken}` } })
    ).json()) as { sub?: string; email?: string; name?: string };
    await storeConnection({
      userId: hostUserId,
      provider: 'google_calendar',
      accountId: info.sub ?? '',
      accountEmail: info.email ?? '',
      accountName: info.name ?? '',
      scopes: SCOPES,
      ...tokens,
    });
    return { accountEmail: info.email ?? '' };
  }

  async create(input: CreateMeetingInput): Promise<CreatedMeeting> {
    const token = await this.token(input.host.userId);
    const res = await fetch(`${EVENTS_URL}?conferenceDataVersion=1&sendUpdates=all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: input.title,
        description: input.description,
        start: { dateTime: input.startsAt.toISOString() },
        end: { dateTime: input.endsAt.toISOString() },
        attendees: input.attendees.map((a) => ({ email: a.email, displayName: a.name })),
        guestsCanInviteOthers: false,
        conferenceData: {
          createRequest: { requestId: `mba-${input.referenceId}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
        },
        reminders: { useDefault: true },
      }),
    });
    if (!res.ok) throw new Error(`Google Calendar rejected the event (${res.status}).`);
    const event = (await res.json()) as {
      id: string;
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
    };
    const joinUrl =
      event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri;
    if (!joinUrl) throw new Error('Google created the event but did not attach a Meet link.');
    return { provider: this.id, joinUrl, externalId: event.id };
  }

  async cancel(hostUserId: string, externalId: string) {
    const token = await this.token(hostUserId);
    const res = await fetch(`${EVENTS_URL}/${encodeURIComponent(externalId)}?sendUpdates=all`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Google Calendar refused the cancellation (${res.status}).`);
    }
  }

  private async token(userId: string) {
    const token = await accessTokenFor(userId, 'google_calendar', (refresh_token) =>
      this.exchange({ grant_type: 'refresh_token', refresh_token })
    );
    if (!token) throw new Error('Reconnect Google Calendar to create Meet links.');
    return token;
  }

  private async exchange(params: Record<string, string>): Promise<TokenSet> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...params }),
    });
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !json.access_token) throw new Error(`Google token exchange failed: ${json.error ?? res.status}`);
    return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresIn: json.expires_in };
  }
}
