'use client';

import { api } from './api';

/** Registers the service worker once per page load; safe to call repeatedly. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register('/sw.js').catch(() => null);
}

function base64ToUint8(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushState = 'unsupported' | 'disabled' | 'denied' | 'off' | 'on';

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !('PushManager' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  const { enabled } = await api.get<{ enabled: boolean }>('/api/push/subscribe');
  if (!enabled) return 'disabled';
  if (Notification.permission === 'denied') return 'denied';
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? 'on' : 'off';
}

/** Asks permission (from a click — browsers require a gesture) and registers this browser. */
export async function enablePush(): Promise<PushState> {
  const { publicKey, enabled } = await api.get<{ publicKey: string | null; enabled: boolean }>('/api/push/subscribe');
  if (!enabled || !publicKey) return 'disabled';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8(publicKey) }));
  const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api.post('/api/push/subscribe', { kind: 'web', endpoint: json.endpoint, keys: json.keys, platform: 'web' });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api.delete('/api/push/subscribe', { target: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return 'off';
}
