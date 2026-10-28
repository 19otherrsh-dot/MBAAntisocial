import { router } from 'expo-router';

/**
 * Opens a web-only screen inside the app, already signed in: the web screen
 * trades a one-time code for a cookie session (see app/web.tsx).
 */
export function openWeb(path: string, title: string) {
  router.push({ pathname: '/web', params: { path, title } });
}
