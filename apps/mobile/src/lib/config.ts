/**
 * Where the app finds the MBAAntisocial web API. Set EXPO_PUBLIC_API_URL in
 * apps/mobile/.env (Android emulators reach the host machine at 10.0.2.2).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Must match `scheme` in app.json and MOBILE_APP_SCHEME on the server. */
export const APP_SCHEME = 'mbaantisocial';
