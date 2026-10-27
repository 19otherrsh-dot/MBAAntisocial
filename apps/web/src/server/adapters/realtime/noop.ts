import type { RealtimePublisher } from '../../ports/realtime';

/** No realtime service: clients fall back to polling and manual refresh. */
export class NoopRealtimePublisher implements RealtimePublisher {
  readonly id = 'noop';
  async publish() {}
  async online() {
    return new Set<string>();
  }
}
