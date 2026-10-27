/**
 * Video meeting providers for mock sessions (§6.1: "auto-link generation on
 * booking"). Each provider is interchangeable behind this interface, so the
 * booking flow neither knows nor cares whether a Meet, Zoom, or built-in room
 * came back.
 */
export const MEETING_PROVIDER_IDS = ['google_meet', 'zoom', 'livekit', 'jitsi', 'manual'] as const;
export type MeetingProviderId = (typeof MEETING_PROVIDER_IDS)[number];

export interface MeetingParticipant {
  email: string;
  name: string;
}

export interface CreateMeetingInput {
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  host: MeetingParticipant & { userId: string };
  attendees: MeetingParticipant[];
  /** Our slot id — providers that support idempotency keys use it. */
  referenceId: string;
  /** Used by the manual provider. */
  fallbackUrl?: string;
}

export interface CreatedMeeting {
  provider: MeetingProviderId;
  joinUrl: string;
  /** Provider-side id, for cancel/update. */
  externalId: string | null;
  /** Host-only link where a provider distinguishes one (Zoom start_url). */
  hostUrl?: string | null;
}

export interface MeetingProvider {
  readonly id: MeetingProviderId;
  readonly label: string;
  /** Whether the deployment has credentials for this provider at all. */
  readonly configured: boolean;
  /** Whether this provider needs the host to connect an account first. */
  readonly requiresConnection: boolean;
  /** Whether `hostUserId` can create meetings right now. */
  isReadyFor(hostUserId: string): Promise<boolean>;
  create(input: CreateMeetingInput): Promise<CreatedMeeting>;
  cancel(hostUserId: string, externalId: string): Promise<void>;
}

/** A provider that needs an OAuth connection per host. */
export interface ConnectableMeetingProvider extends MeetingProvider {
  authorizeUrl(state: string, redirectUri: string): string;
  completeConnection(hostUserId: string, code: string, redirectUri: string): Promise<{ accountEmail: string }>;
}

export function isConnectable(p: MeetingProvider): p is ConnectableMeetingProvider {
  return 'authorizeUrl' in p && 'completeConnection' in p;
}
