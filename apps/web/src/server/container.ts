import { env } from '@/lib/env';
import type { AiProvider } from './ports/ai';
import type { EmailSender } from './ports/email';
import type { FileStorage } from './ports/storage';
import type { RealtimePublisher } from './ports/realtime';
import type { NativePushSender, WebPushSender } from './ports/push';
import type { KeyValueStore } from './ports/kv';
import type { MeetingProvider, MeetingProviderId } from './ports/meetings';
import { getRedis } from './redis';
import { ClaudeAiProvider } from './adapters/ai/claude';
import { DisabledAiProvider } from './adapters/ai/disabled';
import { ResendEmailSender } from './adapters/email/resend';
import { SmtpEmailSender } from './adapters/email/smtp';
import { ConsoleEmailSender } from './adapters/email/console';
import { CloudinaryStorage } from './adapters/storage/cloudinary';
import { DiskStorage } from './adapters/storage/disk';
import { RedisRealtimePublisher } from './adapters/realtime/redis';
import { NoopRealtimePublisher } from './adapters/realtime/noop';
import { VapidWebPushSender } from './adapters/push/web-push';
import { ExpoPushSender } from './adapters/push/expo';
import { RedisKeyValueStore } from './adapters/kv/redis';
import { MemoryKeyValueStore } from './adapters/kv/memory';
import { GoogleMeetProvider } from './adapters/meetings/google-meet';
import { ZoomProvider } from './adapters/meetings/zoom';
import { LiveKitMeetingProvider } from './adapters/meetings/livekit';
import { ManualMeetingProvider } from './adapters/meetings/manual';

/**
 * Composition root.
 *
 * The only module that knows which concrete adapter backs each port. Domain
 * code asks for `container.email` and receives *an* `EmailSender`; whether that
 * is Resend, SMTP, or the console fallback is decided once, here, from the
 * environment. Adding a provider means writing an adapter and one line below —
 * no feature code changes (open/closed), and every feature can be tested
 * against a fake by overriding the container (dependency inversion).
 */
export interface Container {
  ai: AiProvider;
  email: EmailSender;
  storage: FileStorage;
  realtime: RealtimePublisher;
  webPush: WebPushSender;
  nativePush: NativePushSender;
  kv: KeyValueStore;
  /** Ordered by preference: the first ready provider wins when a host has not chosen. */
  meetings: Map<MeetingProviderId, MeetingProvider>;
}

function build(): Container {
  const redis = getRedis();

  const meetings = new Map<MeetingProviderId, MeetingProvider>();
  if (env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET) {
    meetings.set('google_meet', new GoogleMeetProvider(env.GOOGLE_CALENDAR_CLIENT_ID, env.GOOGLE_CALENDAR_CLIENT_SECRET));
  }
  if (env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET) {
    meetings.set('zoom', new ZoomProvider(env.ZOOM_CLIENT_ID, env.ZOOM_CLIENT_SECRET));
  }
  if (env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET) {
    meetings.set('livekit', new LiveKitMeetingProvider(env.APP_URL));
  }
  meetings.set('manual', new ManualMeetingProvider());

  return {
    ai: env.ANTHROPIC_API_KEY ? new ClaudeAiProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : new DisabledAiProvider(),

    email: env.RESEND_API_KEY
      ? new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM)
      : env.SMTP_URL
        ? new SmtpEmailSender(env.SMTP_URL, env.EMAIL_FROM)
        : new ConsoleEmailSender(),

    storage:
      env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
        ? new CloudinaryStorage(env.CLOUDINARY_CLOUD_NAME, env.CLOUDINARY_API_KEY, env.CLOUDINARY_API_SECRET)
        : new DiskStorage(env.UPLOAD_DIR, env.APP_URL),

    realtime: redis ? new RedisRealtimePublisher(redis) : new NoopRealtimePublisher(),

    webPush: new VapidWebPushSender(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null, env.VAPID_PRIVATE_KEY ?? null, env.VAPID_SUBJECT),
    nativePush: new ExpoPushSender(env.EXPO_ACCESS_TOKEN ?? null),

    kv: redis ? new RedisKeyValueStore(redis) : new MemoryKeyValueStore(),

    meetings,
  };
}

declare global {
  var appContainer: Container | undefined;
}

/** Lazily built once per process. */
export function container(): Container {
  if (!globalThis.appContainer) globalThis.appContainer = build();
  return globalThis.appContainer;
}

/** Test seam: swap any adapter for a fake. */
export function overrideContainer(overrides: Partial<Container>): void {
  globalThis.appContainer = { ...container(), ...overrides };
}

export function resetContainer(): void {
  globalThis.appContainer = undefined;
}
