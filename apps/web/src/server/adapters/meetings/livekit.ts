import type { CreateMeetingInput, CreatedMeeting, MeetingProvider } from '../../ports/meetings';

/**
 * Built-in video room. Nothing is created remotely: LiveKit rooms come into
 * existence when the first participant joins with a token, so the "meeting" is
 * just a stable room name behind our own /meet page, which also works inside
 * the native apps.
 */
export class LiveKitMeetingProvider implements MeetingProvider {
  readonly id = 'livekit' as const;
  readonly label = 'Built-in video';
  readonly configured = true;
  readonly requiresConnection = false;

  constructor(private readonly appUrl: string) {}

  async isReadyFor() {
    return true;
  }

  async create(input: CreateMeetingInput): Promise<CreatedMeeting> {
    const room = `session-${input.referenceId}`;
    return { provider: this.id, joinUrl: `${this.appUrl}/meet/${room}`, externalId: room };
  }

  async cancel() {}
}
