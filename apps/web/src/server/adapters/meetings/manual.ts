import type { CreateMeetingInput, CreatedMeeting, MeetingProvider } from '../../ports/meetings';

/**
 * The mentor's standing room link (a personal Meet/Zoom/Teams URL). Always
 * available, so a booking never fails for want of an integration — it just
 * flags that a link is still needed when the mentor has not set one.
 */
export class ManualMeetingProvider implements MeetingProvider {
  readonly id = 'manual' as const;
  readonly label = 'My own link';
  readonly configured = true;
  readonly requiresConnection = false;

  async isReadyFor() {
    return true;
  }

  async create(input: CreateMeetingInput): Promise<CreatedMeeting> {
    return { provider: this.id, joinUrl: input.fallbackUrl ?? '', externalId: null };
  }

  async cancel() {}
}
