export interface PushPayload {
  title: string;
  body: string;
  href: string;
  tag?: string;
}

export interface WebPushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Result per target so dead subscriptions can be pruned. */
export interface PushOutcome {
  target: string;
  ok: boolean;
  /** The subscription is permanently gone (404/410, DeviceNotRegistered). */
  expired: boolean;
}

export interface WebPushSender {
  readonly configured: boolean;
  readonly publicKey: string | null;
  send(targets: WebPushTarget[], payload: PushPayload): Promise<PushOutcome[]>;
}

export interface NativePushSender {
  readonly configured: boolean;
  send(tokens: string[], payload: PushPayload): Promise<PushOutcome[]>;
}
