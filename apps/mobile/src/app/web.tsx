import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { api, errorText } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { ErrorNote, Loading, Screen } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * A web screen opened signed in: a one-time code (60 seconds, single use)
 * becomes a cookie session inside this WebView. Used for everything the app
 * does not have natively yet — games, resume studio, timetable, settings.
 */
export default function WebScreen() {
  const { path = '/home', title = '' } = useLocalSearchParams<{ path?: string; title?: string }>();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTheme();

  useEffect(() => {
    let cancelled = false;
    api
      .post<{ code: string }>('/api/mobile/auth/web-code')
      .then(({ code }) => {
        if (!cancelled) setUrl(`${API_URL}/mobile/web-login?code=${encodeURIComponent(code)}&next=${encodeURIComponent(path)}&embed=1`);
      })
      .catch((caught) => !cancelled && setError(errorText(caught)));
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title }} />
      {error ? (
        <Screen edges={[]}>
          <ErrorNote message={error} />
        </Screen>
      ) : !url ? (
        <Loading />
      ) : Platform.OS === 'web' ? (
        <iframe src={url} style={{ flex: 1, border: 0, width: '100%', height: '100%' }} title={title} />
      ) : (
        <WebView
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor: t.bg }}
          // Games use these; the player page asks for full screen and keeps the screen awake.
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          startInLoadingState
          renderLoading={() => <Loading />}
        />
      )}
    </View>
  );
}
