import { router } from 'expo-router';
import { openWeb } from './web';

/**
 * Opens an app path from a notification or a server-provided link: natively
 * where the app has the screen, otherwise the web version, signed in.
 */
export function openHref(href: string) {
  const path = href.split('?')[0];
  if (path === '/' || path === '/home') return router.navigate('/');
  if (path.startsWith('/tasks')) return router.navigate('/tasks');
  if (path.startsWith('/sessions')) return router.navigate('/prep');
  const channel = /^\/hub\/[a-f0-9]{24}\/([a-f0-9]{24})/.exec(path);
  if (channel) return router.push({ pathname: '/chat/[id]', params: { id: channel[1], kind: 'channel' } });
  const dm = /^\/hub\/dm\/([a-f0-9]{24})/.exec(path);
  if (dm) return router.push({ pathname: '/chat/[id]', params: { id: dm[1], kind: 'dm' } });
  if (path.startsWith('/hub')) return router.navigate('/hub');
  return openWeb(href, 'MBAAntisocial');
}
