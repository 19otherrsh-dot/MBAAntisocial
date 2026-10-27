import { randomBytes } from 'node:crypto';
import type { CreateMeetingInput, CreatedMeeting, MeetingProvider } from '../../ports/meetings';

/**
 * A fresh Jitsi room per session: free, no account for attendees, and works in
 * a browser or the Jitsi app. Room names are long and random, so they are not
 * guessable. Point JITSI_BASE_URL at a self-hosted Jitsi for full control.
 */
export class JitsiMeetingProvider implements MeetingProvider {
  readonly id = 'jitsi' as const;
  readonly label = 'Free Jitsi room';
  readonly configured = true;
  readonly requiresConnection = false;

  constructor(private readonly baseUrl: string) {}

  async isReadyFor() {
    return true;
  }

  async create(input: CreateMeetingInput): Promise<CreatedMeeting> {
    const slug = input.title.replace(/[^a-z0-9]+/gi, '').slice(0, 24) || 'Session';
    const room = `MBAAntisocial-${slug}-${randomBytes(9).toString('base64url')}`;
    return { provider: this.id, joinUrl: `${this.baseUrl.replace(/\/$/, '')}/${room}`, externalId: room };
  }

  async cancel() {}
}
