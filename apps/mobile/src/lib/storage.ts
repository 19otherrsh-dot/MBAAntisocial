import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The session token lives in the platform keychain (iOS Keychain, Android
 * Keystore). The web build — a preview, not a product — falls back to
 * localStorage, since SecureStore has no web implementation.
 */
const KEY = 'mba.session';

export async function readToken(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
  return SecureStore.getItemAsync(KEY);
}

export async function writeToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (token) globalThis.localStorage?.setItem(KEY, token);
    else globalThis.localStorage?.removeItem(KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(KEY, token);
  else await SecureStore.deleteItemAsync(KEY);
}
