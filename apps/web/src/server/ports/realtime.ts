import type { RealtimeEventName, RealtimeEvents } from '@mba/shared/realtime';

/** Fan-out to connected clients. Failures never fail the action that caused them. */
export interface RealtimePublisher {
  readonly id: string;
  publish<E extends RealtimeEventName>(topic: string, event: E, data: RealtimeEvents[E]): Promise<void>;
  /** User ids currently connected, from the presence registry. */
  online(userIds: string[]): Promise<Set<string>>;
}
