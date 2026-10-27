import webpush from 'web-push';
import type { PushOutcome, PushPayload, WebPushSender, WebPushTarget } from '../../ports/push';

export class VapidWebPushSender implements WebPushSender {
  readonly configured: boolean;

  constructor(
    readonly publicKey: string | null,
    privateKey: string | null,
    subject: string
  ) {
    this.configured = Boolean(publicKey && privateKey);
    if (publicKey && privateKey) webpush.setVapidDetails(subject, publicKey, privateKey);
  }

  async send(targets: WebPushTarget[], payload: PushPayload): Promise<PushOutcome[]> {
    if (!this.configured) return targets.map((t) => ({ target: t.endpoint, ok: false, expired: false }));
    const body = JSON.stringify(payload);
    return Promise.all(
      targets.map(async (target) => {
        try {
          await webpush.sendNotification(target, body, { TTL: 60 * 60 * 12, urgency: 'normal' });
          return { target: target.endpoint, ok: true, expired: false };
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          return { target: target.endpoint, ok: false, expired: status === 404 || status === 410 };
        }
      })
    );
  }
}
