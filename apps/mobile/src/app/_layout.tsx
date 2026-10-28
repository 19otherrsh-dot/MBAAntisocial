import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { RealtimeProvider } from '@/lib/realtime';
import { registerForPush } from '@/lib/push';
import { openHref } from '@/lib/links';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { palette } from '@/theme';

SplashScreen.preventAutoHideAsync();

// Show notifications that arrive while the app is open, quietly.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Gate() {
  const { ready, user } = useAuth();
  const scheme = useColorScheme();
  const t = palette[scheme === 'dark' ? 'dark' : 'light'];
  const signedIn = Boolean(user);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    if (!signedIn) return;
    registerForPush().catch(() => false);
    // A tapped notification opens what it is about.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const href = response.notification.request.content.data?.href;
      if (typeof href === 'string') openHref(href);
    });
    return () => subscription.remove();
  }, [signedIn]);

  if (!ready) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: t.accent, background: t.bg, card: t.surface, text: t.text, border: t.line } };

  return (
    <ThemeProvider value={theme}>
      <RealtimeProvider enabled={signedIn}>
        <Stack screenOptions={{ headerShown: false, headerTintColor: t.accent, headerStyle: { backgroundColor: t.surface }, headerTitleStyle: { color: t.text } }}>
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: 'Chat', headerBackTitle: 'Hub' }} />
            <Stack.Screen name="web" options={{ headerShown: true, title: '' }} />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
        </Stack>
      </RealtimeProvider>
    </ThemeProvider>
  );
}
