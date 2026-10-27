import { SESSION_TYPE_META, type SessionType } from '@/lib/constants';
import { container } from '../../container';
import type { MeetingProviderId } from '../../ports/meetings';

export interface MeetingParty {
  id: string;
  name: string;
  email: string;
}

export interface ProvisionInput {
  referenceId: string;
  sessionType: SessionType;
  startAt: Date;
  endAt: Date;
  note: string;
  host: MeetingParty & { preferred: MeetingProviderId; standingLink: string };
  attendee: MeetingParty;
}

export interface ProvisionedMeeting {
  link: string;
  provider: MeetingProviderId;
  externalId: string;
  hostUrl: string;
  /** Set when the preferred provider failed and a fallback was used. */
  fallbackReason?: string;
}

/**
 * Creates the meeting for a booked session. Tries the mentor's chosen provider
 * first; if it is not connected or errors, falls back to their standing link,
 * then to a free Jitsi room — so a booking always comes with somewhere to meet.
 */
export async function provisionMeeting(input: ProvisionInput): Promise<ProvisionedMeeting> {
  const { meetings } = container();
  const title = `${SESSION_TYPE_META[input.sessionType].label}: ${input.host.name} × ${input.attendee.name}`;
  const description = [
    `Mock session booked on MBAAntisocial.`,
    input.note ? `Junior's note: ${input.note}` : '',
    `Manage it at /sessions`,
  ]
    .filter(Boolean)
    .join('\n');

  const order: MeetingProviderId[] = [input.host.preferred, 'manual', 'jitsi'];
  let fallbackReason: string | undefined;

  for (const id of [...new Set(order)]) {
    const provider = meetings.get(id);
    if (!provider) continue;
    if (id === 'manual' && !input.host.standingLink) continue;
    try {
      if (!(await provider.isReadyFor(input.host.id))) {
        fallbackReason ??= `${provider.label} is not connected`;
        continue;
      }
      const meeting = await provider.create({
        title,
        description,
        startsAt: input.startAt,
        endsAt: input.endAt,
        host: { userId: input.host.id, email: input.host.email, name: input.host.name },
        attendees: [{ email: input.attendee.email, name: input.attendee.name }],
        referenceId: input.referenceId,
        fallbackUrl: input.host.standingLink,
      });
      if (!meeting.joinUrl) continue;
      return {
        link: meeting.joinUrl,
        provider: meeting.provider,
        externalId: meeting.externalId ?? '',
        hostUrl: meeting.hostUrl ?? '',
        fallbackReason: id === input.host.preferred ? undefined : fallbackReason,
      };
    } catch (error) {
      fallbackReason ??= error instanceof Error ? error.message : `${provider.label} failed`;
      console.error(`[meetings] ${id} failed for ${input.referenceId}:`, error);
    }
  }
  return { link: '', provider: 'manual', externalId: '', hostUrl: '', fallbackReason };
}

/** Best-effort cancellation; a provider outage must never block a cancel. */
export async function releaseMeeting(hostId: string, provider: string, externalId: string) {
  if (!externalId) return;
  const meeting = container().meetings.get(provider as MeetingProviderId);
  if (!meeting) return;
  try {
    await meeting.cancel(hostId, externalId);
  } catch (error) {
    console.error(`[meetings] cancel on ${provider} failed:`, error);
  }
}
