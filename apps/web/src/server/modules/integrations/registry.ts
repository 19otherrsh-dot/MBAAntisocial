import type { ExternalProvider } from '@/models/ExternalAccount';
import { container } from '../../container';
import { isConnectable } from '../../ports/meetings';
import { disconnect as removeConnection } from '../oauth-tokens';

/**
 * Accounts a user can connect for integrations (not sign-in). Each connector
 * knows how to start and finish its OAuth dance; the routes stay generic.
 */
export interface IntegrationConnector {
  provider: ExternalProvider;
  label: string;
  description: string;
  authorizeUrl(state: string, redirectUri: string): string;
  complete(userId: string, code: string, redirectUri: string): Promise<{ accountEmail: string }>;
}

function meetingConnector(provider: ExternalProvider, meetingId: 'google_meet' | 'zoom', description: string): IntegrationConnector | null {
  const meeting = container().meetings.get(meetingId);
  if (!meeting || !isConnectable(meeting)) return null;
  return {
    provider,
    label: meeting.label === 'Google Meet' ? 'Google Calendar & Meet' : meeting.label,
    description,
    authorizeUrl: (state, redirectUri) => meeting.authorizeUrl(state, redirectUri),
    complete: (userId, code, redirectUri) => meeting.completeConnection(userId, code, redirectUri),
  };
}

export async function connectors(): Promise<IntegrationConnector[]> {
  const discord = await import('../hub/discord-connector').then((m) => m.discordConnector()).catch(() => null);
  return [
    meetingConnector('google_calendar', 'google_meet', 'Booked sessions get a Google Meet link and land on your calendar.'),
    meetingConnector('zoom', 'zoom', 'Booked sessions get a Zoom meeting on your account.'),
    discord,
  ].filter((c): c is IntegrationConnector => c !== null);
}

export async function connectorFor(provider: string): Promise<IntegrationConnector | undefined> {
  return (await connectors()).find((c) => c.provider === provider);
}

export async function disconnect(userId: string, provider: ExternalProvider) {
  await removeConnection(userId, provider);
}
