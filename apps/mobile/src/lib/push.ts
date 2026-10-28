import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * Registers this device for push: asks permission once, gets an Expo push
 * token, and hands it to the server, which already sends through Expo.
 * Quietly does nothing on simulators, on the web, without an EAS project id,
 * or when the person says no.
 */
export async function registerForPush(): Promise<boolean> {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Updates', importance: AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.post('/api/push/subscribe', { kind: 'expo', token, platform: Platform.OS });
  return true;
}
