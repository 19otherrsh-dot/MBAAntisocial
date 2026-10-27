import type { NativePushSender, PushOutcome, PushPayload } from '../../ports/push';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

/**
 * Expo's push service fronts both APNs and FCM, so one integration covers the
 * iOS and Android apps. Works without an access token; set EXPO_ACCESS_TOKEN
 * once push security is enabled on the Expo project.
 */
export class ExpoPushSender implements NativePushSender {
  readonly configured = true;
  constructor(private readonly accessToken: string | null) {}

  async send(tokens: string[], payload: PushPayload): Promise<PushOutcome[]> {
    const outcomes: PushOutcome[] = [];
    for (let i = 0; i < tokens.length; i += BATCH) {
      const chunk = tokens.slice(i, i + BATCH);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          },
          body: JSON.stringify(
            chunk.map((to) => ({
              to,
              title: payload.title,
              body: payload.body,
              data: { href: payload.href },
              sound: 'default',
              ...(payload.tag ? { collapseId: payload.tag, threadId: payload.tag } : {}),
            }))
          ),
        });
        const json = (await res.json()) as { data?: ExpoTicket[] };
        const tickets = json.data ?? [];
        chunk.forEach((token, idx) => {
          const ticket = tickets[idx];
          outcomes.push({
            target: token,
            ok: ticket?.status === 'ok',
            expired: ticket?.details?.error === 'DeviceNotRegistered',
          });
        });
      } catch (error) {
        console.error('[push:expo] send failed:', error instanceof Error ? error.message : error);
        chunk.forEach((token) => outcomes.push({ target: token, ok: false, expired: false }));
      }
    }
    return outcomes;
  }
}
